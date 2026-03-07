import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireChannelMembership, requirePublicChannelReadAccess } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { isUserOnline, getIO } from '../websocket/index.js';
import { USER_SELECT_BASIC, USER_SELECT_FULL, MESSAGE_INCLUDE_FULL } from '../db/selects.js';
import { parseIntParam } from '../utils/params.js';
import { logError } from '../utils/logger.js';

const router = Router();

const createChannelSchema = z.object({
  name: z.string()
    .min(1)
    .max(80)
    .refine(
      (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
      { message: 'Channel name cannot contain path traversal characters' }
    )
    .refine(
      (name) => !/[\x00-\x1F\x7F]/.test(name),
      { message: 'Channel name cannot contain control characters' }
    ),
  isPrivate: z.boolean().optional().default(false),
});

// POST /channels - Create channel
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role === 'GUEST') {
      res.status(403).json({ error: 'Guests cannot create channels' });
      return;
    }
    const { name, isPrivate } = createChannelSchema.parse(req.body);
    const userId = req.user!.userId;

    const channel = await prisma.channel.create({
      data: {
        name,
        isPrivate,
        createdBy: userId,
        members: {
          create: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    res.status(201).json(channel);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(400).json({ error: 'Channel name already exists' });
      return;
    }
    logError('Create channel error', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// GET /channels - List all channels
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isGuest = req.user!.role === 'GUEST';

    const channels = await prisma.channel.findMany({
      where: isGuest
        ? { members: { some: { userId } } }
        : {
            OR: [
              { isPrivate: false },
              { members: { some: { userId } } },
            ],
          },
      include: {
        _count: {
          select: { members: true, messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Batch: get memberships and unread counts in parallel (2 queries instead of N+1)
    const channelIds = channels.map(c => c.id);

    const [memberships, unreadRows] = await Promise.all([
      prisma.channelMember.findMany({
        where: { userId, channelId: { in: channelIds } },
        select: { channelId: true },
      }),
      channelIds.length > 0
        ? prisma.$queryRaw<Array<{ channelId: number; unreadCount: bigint }>>`
            SELECT m."channelId", COUNT(*)::bigint AS "unreadCount"
            FROM "Message" m
            JOIN "ChannelMember" cm ON cm."channelId" = m."channelId" AND cm."userId" = ${userId}
            LEFT JOIN "ChannelRead" cr ON cr."channelId" = m."channelId" AND cr."userId" = ${userId}
            WHERE m."channelId" = ANY(${channelIds})
              AND m."threadId" IS NULL
              AND m."deletedAt" IS NULL
              AND (cr."lastReadMessageId" IS NULL OR m.id > cr."lastReadMessageId")
            GROUP BY m."channelId"
          `
        : Promise.resolve([]),
    ]);

    const memberSet = new Set(memberships.map(m => m.channelId));
    const unreadMap = new Map(unreadRows.map(r => [r.channelId, Number(r.unreadCount)]));

    const channelsWithUnread = channels.map((channel) => ({
      ...channel,
      unreadCount: memberSet.has(channel.id) ? (unreadMap.get(channel.id) || 0) : 0,
      isMember: memberSet.has(channel.id),
    }));

    res.json(channelsWithUnread);
  } catch (error) {
    logError('List channels error', error);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

// GET /channels/:id - Get single channel
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseIntParam(req.params.id);
    if (!channelId) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }
    const userId = req.user!.userId;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const isMember = channel.members.some(m => m.userId === userId);

    // Check access for private channels
    if (channel.isPrivate && !isMember) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // Strip emails from member list for non-members viewing public channels
    if (!isMember) {
      const sanitized = {
        ...channel,
        members: channel.members.map(m => ({
          ...m,
          user: { id: m.user.id, name: m.user.name },
        })),
      };
      res.json(sanitized);
      return;
    }

    res.json(channel);
  } catch (error) {
    logError('Get channel error', error);
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

// POST /channels/:id/join - Join a channel
router.post('/:id/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role === 'GUEST') {
      res.status(403).json({ error: 'Guests cannot join channels' });
      return;
    }
    const channelId = parseIntParam(req.params.id);
    if (!channelId) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }
    const userId = req.user!.userId;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // Prevent joining private channels without invite
    if (channel.isPrivate) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const existingMembership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId },
      },
    });

    if (existingMembership) {
      res.status(400).json({ error: 'Already a member of this channel' });
      return;
    }

    await prisma.channelMember.create({
      data: { userId, channelId },
    });

    // Auto-create ChannelRead so all existing messages count as unread
    await prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastReadMessageId: null },
      update: {},
    });

    res.json({ message: 'Joined channel successfully' });
  } catch (error) {
    logError('Join channel error', error);
    res.status(500).json({ error: 'Failed to join channel' });
  }
});

// POST /channels/:id/leave - Leave a channel
router.post('/:id/leave', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const userId = req.user!.userId;

    // Wrap in transaction to avoid race condition on member count
    const result = await prisma.$transaction(async (tx) => {
      const memberCount = await tx.channelMember.count({ where: { channelId } });

      if (memberCount <= 1) {
        // Last member leaving — delete the channel (cascades to members)
        await tx.channel.delete({ where: { id: channelId } });
        return { deleted: true, memberCount: 0 };
      }

      await tx.channelMember.delete({
        where: { userId_channelId: { userId, channelId } },
      });
      const updatedCount = await tx.channelMember.count({ where: { channelId } });
      return { deleted: false, memberCount: updatedCount };
    });

    if (!result.deleted) {
      const io = getIO();
      if (io) {
        io.to(`channel:${channelId}`).emit('channel:member-left', {
          channelId,
          userId,
          memberCount: result.memberCount,
        });
        // Evict user's sockets from the channel room so they stop receiving messages
        io.in(`user:${userId}`).socketsLeave(`channel:${channelId}`);
      }
    }

    res.json({ message: 'Left channel successfully' });
  } catch (error) {
    logError('Leave channel error', error);
    res.status(500).json({ error: 'Failed to leave channel' });
  }
});

// GET /channels/:id/members - List channel members
router.get('/:id/members', authMiddleware, requirePublicChannelReadAccess, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;

    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: {
          select: USER_SELECT_FULL,
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    // Enrich with real-time online status
    const enrichedMembers = members.map((m) => ({
      ...m,
      user: {
        ...m.user,
        isOnline: isUserOnline(m.user.id),
        status: isUserOnline(m.user.id) ? 'online' : (m.user.status || 'offline'),
      },
    }));

    res.json(enrichedMembers);
  } catch (error) {
    logError('List members error', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// POST /channels/:id/members - Add a user to a channel
const addMemberSchema = z.object({
  userId: z.number().int().positive(),
});

router.post('/:id/members', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const { userId } = addMemberSchema.parse(req.body);

    // For private channels, only the channel creator can add users
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (channel?.isPrivate) {
      if (channel.createdBy !== req.user!.userId) {
        res.status(403).json({ error: 'Only the channel creator can add members to private channels' });
        return;
      }
    }

    // Check user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check not already a member
    const existing = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    if (existing) {
      res.status(400).json({ error: 'User is already a member' });
      return;
    }

    await prisma.channelMember.create({
      data: { userId, channelId },
    });

    await prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastReadMessageId: null },
      update: {},
    });

    // Get updated member count
    const memberCount = await prisma.channelMember.count({ where: { channelId } });

    // Notify all channel members (including the newly added user) via WebSocket
    const io = getIO();
    if (io) {
      // Notify existing channel members about the updated count
      io.to(`channel:${channelId}`).emit('channel:member-added', {
        channelId,
        userId,
        memberCount,
      });
      // Notify the added user so their sidebar refreshes
      io.to(`user:${userId}`).emit('channel:joined', {
        channelId,
        memberCount,
      });
    }

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    logError('Add member error', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// POST /channels/:id/read - Mark channel as read
const markReadSchema = z.object({
  messageId: z.number().int().positive(),
});

router.post('/:id/read', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const userId = req.user!.userId;
    const { messageId } = markReadSchema.parse(req.body);

    // Verify the message exists in this channel
    const message = await prisma.message.findFirst({
      where: { id: messageId, channelId, deletedAt: null },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found in this channel' });
      return;
    }

    // Prevent going backward — only advance the read position
    const currentRead = await prisma.channelRead.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    if (currentRead?.lastReadMessageId && messageId < currentRead.lastReadMessageId) {
      res.json({ success: true });
      return;
    }

    await prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastReadMessageId: messageId },
      update: { lastReadMessageId: messageId },
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Mark channel read error', error);
    res.status(500).json({ error: 'Failed to mark channel as read' });
  }
});

// POST /channels/:id/unread - Mark channel as unread from a specific message
const markUnreadSchema = z.object({
  messageId: z.number().int().positive(),
});

router.post('/:id/unread', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const userId = req.user!.userId;
    const { messageId } = markUnreadSchema.parse(req.body);

    // Verify messageId belongs to this channel
    const targetMessage = await prisma.message.findFirst({
      where: { id: messageId, channelId, deletedAt: null },
    });
    if (!targetMessage) {
      res.status(404).json({ error: 'Message not found in this channel' });
      return;
    }

    // Find the message just before this one in the channel
    const previousMessage = await prisma.message.findFirst({
      where: {
        channelId,
        threadId: null,
        deletedAt: null,
        id: { lt: messageId },
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    // Set lastReadMessageId to the previous message (or null if this is the first message)
    await prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastReadMessageId: previousMessage?.id ?? null },
      update: { lastReadMessageId: previousMessage?.id ?? null },
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Mark channel unread error', error);
    res.status(500).json({ error: 'Failed to mark channel as unread' });
  }
});

// GET /channels/:id/files - Get files uploaded in channel
router.get('/:id/files', authMiddleware, requirePublicChannelReadAccess, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;

    const files = await prisma.file.findMany({
      where: {
        message: { channelId, deletedAt: null },
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(files);
  } catch (error) {
    logError('Get channel files error', error);
    res.status(500).json({ error: 'Failed to get channel files' });
  }
});

// GET /channels/:id/pins - Get pinned messages
router.get('/:id/pins', authMiddleware, requirePublicChannelReadAccess, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;

    const pins = await prisma.message.findMany({
      where: { channelId, isPinned: true, deletedAt: null },
      include: MESSAGE_INCLUDE_FULL,
      orderBy: { pinnedAt: 'desc' },
    });

    res.json(pins);
  } catch (error) {
    logError('Get pinned messages error', error);
    res.status(500).json({ error: 'Failed to get pinned messages' });
  }
});

export default router;
