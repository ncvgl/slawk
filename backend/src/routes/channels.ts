import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireChannelMembership } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { isUserOnline, getIO } from '../websocket/index.js';
import { USER_SELECT_BASIC, USER_SELECT_FULL, MESSAGE_INCLUDE_FULL } from '../db/selects.js';

const router = Router();

const createChannelSchema = z.object({
  name: z.string()
    .min(1)
    .max(80)
    .refine(
      (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
      { message: 'Channel name cannot contain path traversal characters' }
    ),
  isPrivate: z.boolean().optional().default(false),
});

// POST /channels - Create channel
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, isPrivate } = createChannelSchema.parse(req.body);
    const userId = req.user!.userId;

    // Check for duplicate channel name
    const existingChannel = await prisma.channel.findFirst({
      where: { name },
    });

    if (existingChannel) {
      res.status(400).json({ error: 'Channel name already exists' });
      return;
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        isPrivate,
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
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// GET /channels - List all channels
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const channels = await prisma.channel.findMany({
      where: {
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
    console.error('List channels error:', error);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

// GET /channels/:id - Get single channel
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    if (isNaN(channelId)) {
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

    // Check access for private channels
    if (channel.isPrivate) {
      const isMember = channel.members.some(m => m.userId === userId);
      if (!isMember) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }
    }

    res.json(channel);
  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

// POST /channels/:id/join - Join a channel
router.post('/:id/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    if (isNaN(channelId)) {
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
    console.error('Join channel error:', error);
    res.status(500).json({ error: 'Failed to join channel' });
  }
});

// POST /channels/:id/leave - Leave a channel
router.post('/:id/leave', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const userId = req.user!.userId;

    // Check if user is the last member
    const memberCount = await prisma.channelMember.count({
      where: { channelId },
    });

    if (memberCount <= 1) {
      res.status(400).json({ error: 'Cannot leave channel as the last member' });
      return;
    }

    await prisma.channelMember.delete({
      where: {
        userId_channelId: { userId, channelId },
      },
    });

    // Broadcast to other channel members
    const updatedCount = await prisma.channelMember.count({ where: { channelId } });
    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit('channel:member-left', {
        channelId,
        userId,
        memberCount: updatedCount,
      });
    }

    res.json({ message: 'Left channel successfully' });
  } catch (error) {
    console.error('Leave channel error:', error);
    res.status(500).json({ error: 'Failed to leave channel' });
  }
});

// GET /channels/:id/members - List channel members
router.get('/:id/members', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
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
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// POST /channels/:id/members - Add a user to a channel
router.post('/:id/members', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const { userId } = req.body;

    if (!userId || typeof userId !== 'number') {
      res.status(400).json({ error: 'userId is required' });
      return;
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
    console.error('Add member error:', error);
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
    console.error('Mark channel read error:', error);
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
    console.error('Mark channel unread error:', error);
    res.status(500).json({ error: 'Failed to mark channel as unread' });
  }
});

// GET /channels/:id/files - Get files uploaded in channel
router.get('/:id/files', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
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
    console.error('Get channel files error:', error);
    res.status(500).json({ error: 'Failed to get channel files' });
  }
});

// GET /channels/:id/pins - Get pinned messages
router.get('/:id/pins', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;

    const pins = await prisma.message.findMany({
      where: { channelId, isPinned: true, deletedAt: null },
      include: MESSAGE_INCLUDE_FULL,
      orderBy: { pinnedAt: 'desc' },
    });

    res.json(pins);
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({ error: 'Failed to get pinned messages' });
  }
});

export default router;
