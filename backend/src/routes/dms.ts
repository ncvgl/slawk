import { Router, Response } from 'express';
import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '../utils/params.js';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDmOwnership, requireDmAccess } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { isUserOnline, getIO } from '../websocket/index.js';
import { USER_SELECT_BASIC, FILE_SELECT, DM_INCLUDE_USERS } from '../db/selects.js';
import { parsePagination, paginateResults } from '../utils/pagination.js';
import { parseIntParam } from '../utils/params.js';
import { logError } from '../utils/logger.js';
import { sendPushToUser } from '../services/pushService.js';

const router = Router();

const sendDMSchema = z.object({
  toUserId: z.number().int().positive(),
  content: z.string().max(MAX_MESSAGE_LENGTH)
    .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' }),
  fileIds: z.array(z.number().int().positive()).max(10).optional(),
}).refine(
  (data) => (data.content?.trim().length ?? 0) > 0 || (data.fileIds && data.fileIds.length > 0),
  { message: 'Message must have content or file attachments' },
);

// POST /dms - Send a direct message
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const fromUserId = req.user!.userId;
    const { toUserId, content, fileIds } = sendDMSchema.parse(req.body);

    // Check if recipient exists and is active (self-DM is allowed)
    if (fromUserId !== toUserId) {
      const recipient = await prisma.user.findUnique({
        where: { id: toUserId },
        select: { id: true, deactivatedAt: true },
      });

      if (!recipient || recipient.deactivatedAt) {
        res.status(400).json({ error: 'Unable to send message' });
        return;
      }

      // Guests can only DM users who share a channel with them
      if (req.user!.role === 'GUEST') {
        const sharedChannel = await prisma.$queryRaw<Array<{ id: number }>>`
          SELECT cm1."channelId" AS id
          FROM "ChannelMember" cm1
          JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId"
          WHERE cm1."userId" = ${fromUserId} AND cm2."userId" = ${toUserId}
          LIMIT 1
        `;
        if (sharedChannel.length === 0) {
          res.status(400).json({ error: 'Unable to send message' });
          return;
        }
      }
    }

    const dm = await prisma.$transaction(async (tx) => {
      const created = await tx.directMessage.create({
        data: {
          content,
          fromUserId,
          toUserId,
          // Self-DMs are auto-read (no notifications for yourself)
          ...(fromUserId === toUserId && { readAt: new Date() }),
        },
      });

      if (fileIds && fileIds.length > 0) {
        const updated = await tx.file.updateMany({
          where: { id: { in: fileIds }, userId: fromUserId, messageId: null, dmId: null },
          data: { dmId: created.id },
        });
        if (updated.count !== fileIds.length) {
          throw new Error('Invalid file IDs or files already attached');
        }
      }

      return tx.directMessage.findUnique({
        where: { id: created.id },
        include: DM_INCLUDE_USERS,
      });
    });

    // Broadcast via WebSocket so the recipient sees the DM in real-time
    const io = getIO();
    if (io && dm) {
      io.to(`user:${fromUserId}`).emit('dm:new', dm);
      if (fromUserId !== toUserId) {
        io.to(`user:${toUserId}`).emit('dm:new', dm);

        // Push notification (fire-and-forget)
        if (!isUserOnline(toUserId)) {
          const senderName = dm.fromUser?.name || 'Someone';
          sendPushToUser(toUserId, {
            title: senderName,
            body: dm.content.slice(0, 100) || 'Sent an attachment',
            url: `/d/${fromUserId}`,
          }).catch((err) => logError('Push notification dispatch failed', err));
        }
      }
    }

    res.status(201).json(dm);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Send DM error', error);
    res.status(500).json({ error: 'Failed to send DM' });
  }
});

// GET /dms - List all DM conversations
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Single query: get all conversations with last message and unread count
    const conversations: any[] = await prisma.$queryRaw`
      WITH conversation_partners AS (
        SELECT DISTINCT
          CASE WHEN "fromUserId" = ${userId} THEN "toUserId" ELSE "fromUserId" END AS "otherUserId"
        FROM "DirectMessage"
        WHERE ("fromUserId" = ${userId} OR "toUserId" = ${userId})
          AND "deletedAt" IS NULL
      ),
      last_messages AS (
        SELECT DISTINCT ON (other_id)
          dm.id,
          dm.content,
          dm."fromUserId",
          dm."toUserId",
          dm."createdAt",
          dm."updatedAt",
          dm."editedAt",
          dm."deletedAt",
          dm."readAt",
          CASE WHEN dm."fromUserId" = ${userId} THEN dm."toUserId" ELSE dm."fromUserId" END AS other_id
        FROM "DirectMessage" dm
        WHERE (dm."fromUserId" = ${userId} OR dm."toUserId" = ${userId})
          AND dm."deletedAt" IS NULL
        ORDER BY other_id, dm."createdAt" DESC
      ),
      unread_counts AS (
        SELECT "fromUserId" AS "otherUserId", COUNT(*)::int AS "unreadCount"
        FROM "DirectMessage"
        WHERE "toUserId" = ${userId}
          AND "deletedAt" IS NULL
          AND "readAt" IS NULL
        GROUP BY "fromUserId"
      )
      SELECT
        jsonb_build_object(
          'id', u.id, 'name', u.name, 'avatar', u.avatar, 'status', u.status
        ) AS "otherUser",
        jsonb_build_object(
          'id', lm.id, 'content', lm.content, 'fromUserId', lm."fromUserId",
          'toUserId', lm."toUserId", 'createdAt', lm."createdAt",
          'updatedAt', lm."updatedAt", 'editedAt', lm."editedAt",
          'deletedAt', lm."deletedAt", 'readAt', lm."readAt"
        ) AS "lastMessage",
        COALESCE(uc."unreadCount", 0) AS "unreadCount"
      FROM conversation_partners cp
      JOIN "User" u ON u.id = cp."otherUserId"
      LEFT JOIN last_messages lm ON lm.other_id = cp."otherUserId"
      LEFT JOIN unread_counts uc ON uc."otherUserId" = cp."otherUserId"
      ORDER BY lm."createdAt" DESC NULLS LAST
    `;

    // Guests: filter conversations to only shared-channel members
    let filteredConversations = conversations;
    if (req.user!.role === 'GUEST') {
      const sharedMembers = await prisma.$queryRaw<Array<{ userId: number }>>`
        SELECT DISTINCT cm2."userId"
        FROM "ChannelMember" cm1
        JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId" AND cm2."userId" != cm1."userId"
        WHERE cm1."userId" = ${userId}
      `;
      const sharedIds = new Set(sharedMembers.map(m => m.userId));
      filteredConversations = conversations.filter(
        (conv: any) => conv.otherUser && sharedIds.has(conv.otherUser.id)
      );
    }

    // Apply online status from WebSocket tracking
    const result = filteredConversations.map((conv) => ({
      otherUser: conv.otherUser ? {
        ...conv.otherUser,
        status: isUserOnline(conv.otherUser.id) ? 'online' : 'offline',
      } : conv.otherUser,
      lastMessage: conv.lastMessage,
      unreadCount: Number(conv.unreadCount),
    }));

    res.json(result);
  } catch (error) {
    logError('Get DM conversations error', error);
    res.status(500).json({ error: 'Failed to get DM conversations' });
  }
});

// GET /dms/:userId - Get DM conversation with specific user
router.get('/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const otherUserId = parseIntParam(req.params.userId);
    if (!otherUserId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Check if the other user exists
    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, name: true, avatar: true, status: true },
    });

    if (!otherUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Guests can only view DM conversations with shared-channel members
    if (req.user!.role === 'GUEST' && currentUserId !== otherUserId) {
      const sharedChannel = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT cm1."channelId" AS id
        FROM "ChannelMember" cm1
        JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId"
        WHERE cm1."userId" = ${currentUserId} AND cm2."userId" = ${otherUserId}
        LIMIT 1
      `;
      if (sharedChannel.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    }

    // Get messages between the two users
    const { limit, cursor } = parsePagination(req);
    const aroundRaw = req.query.around ? parseInt(req.query.around as string) : undefined;
    const around = aroundRaw !== undefined && !isNaN(aroundRaw) && aroundRaw > 0 ? aroundRaw : undefined;

    const dmWhere = {
      OR: [
        { fromUserId: currentUserId, toUserId: otherUserId },
        { fromUserId: otherUserId, toUserId: currentUserId },
      ],
      deletedAt: null,
      threadId: null, // Exclude thread replies from main conversation
    };

    const dmInclude = {
      ...DM_INCLUDE_USERS,
      _count: { select: { replies: { where: { deletedAt: null } } } },
      replies: {
        where: { deletedAt: null },
        select: {
          fromUser: { select: { id: true, name: true, avatar: true } },
        },
        distinct: ['fromUserId' as const],
        take: 5,
      },
    };

    const enrichDMMessages = (msgs: any[]) =>
      msgs.map((msg) => {
        const { replies, ...rest } = msg;
        const threadParticipants = replies
          ? replies.map((r: { fromUser: { id: number; name: string; avatar: string | null } }) => r.fromUser)
          : [];
        return { ...rest, threadParticipants };
      });

    let enrichedMessages: any[];
    let nextCursor: number | undefined;
    let hasMore: boolean;

    if (around) {
      const half = Math.floor(limit / 2);
      const [before, target, after] = await Promise.all([
        prisma.directMessage.findMany({
          where: { ...dmWhere, id: { lt: around } },
          include: dmInclude,
          orderBy: { createdAt: 'desc' },
          take: half,
        }),
        prisma.directMessage.findMany({
          where: { ...dmWhere, id: around },
          include: dmInclude,
          take: 1,
        }),
        prisma.directMessage.findMany({
          where: { ...dmWhere, id: { gt: around } },
          include: dmInclude,
          orderBy: { createdAt: 'asc' },
          take: half,
        }),
      ]);
      enrichedMessages = enrichDMMessages([...before.reverse(), ...target, ...after]);
      nextCursor = undefined;
      hasMore = false;
    } else {
      // Run message fetch and mark-read in parallel — saves one DB round-trip
      const [messages] = await Promise.all([
        prisma.directMessage.findMany({
          where: dmWhere,
          include: dmInclude,
          orderBy: { createdAt: 'desc' },
          take: limit + 1,
          ...(cursor && {
            cursor: { id: cursor },
            skip: 1,
          }),
        }),
        prisma.directMessage.updateMany({
          where: {
            fromUserId: otherUserId,
            toUserId: currentUserId,
            deletedAt: null,
            readAt: null,
          },
          data: {
            readAt: new Date(),
          },
        }).catch((err) => logError('DM read-status update failed', err)),
      ]);

      const paginated = paginateResults(messages, limit);
      enrichedMessages = enrichDMMessages(paginated.results);
      nextCursor = paginated.nextCursor;
      hasMore = paginated.hasMore;
    }

    res.json({
      user: otherUser,
      messages: enrichedMessages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    logError('Get DM conversation error', error);
    res.status(500).json({ error: 'Failed to get DM conversation' });
  }
});

// POST /dms/messages/:id/reply - Reply to a DM (creates thread)
router.post('/messages/:id/reply', authMiddleware, requireDmAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = req.dm.id;
    const fromUserId = req.user!.userId;
    const parentDm = req.dm;

    // Prevent nested threads
    if (parentDm.threadId !== null) {
      res.status(400).json({ error: 'Cannot reply to a reply. Reply to the parent message instead.' });
      return;
    }

    const replySchema = z.object({
      content: z.string().max(MAX_MESSAGE_LENGTH)
        .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' }),
      fileIds: z.array(z.number().int().positive()).max(10).optional(),
    }).refine(
      (data) => (data.content?.trim().length ?? 0) > 0 || (data.fileIds && data.fileIds.length > 0),
      { message: 'Reply must have content or file attachments' },
    );
    const { content, fileIds } = replySchema.parse(req.body);

    // Reply goes to the same conversation (same from/to pair)
    const toUserId = parentDm.fromUserId === fromUserId ? parentDm.toUserId : parentDm.fromUserId;

    // Block replies to deactivated users (same check as POST /dms)
    if (fromUserId !== toUserId) {
      const recipient = await prisma.user.findUnique({
        where: { id: toUserId },
        select: { id: true, deactivatedAt: true },
      });
      if (!recipient || recipient.deactivatedAt) {
        res.status(400).json({ error: 'Unable to send message' });
        return;
      }

      // Guests can only reply to DMs with shared-channel members
      if (req.user!.role === 'GUEST') {
        const sharedChannel = await prisma.$queryRaw<Array<{ id: number }>>`
          SELECT cm1."channelId" AS id
          FROM "ChannelMember" cm1
          JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId"
          WHERE cm1."userId" = ${fromUserId} AND cm2."userId" = ${toUserId}
          LIMIT 1
        `;
        if (sharedChannel.length === 0) {
          res.status(400).json({ error: 'Unable to send message' });
          return;
        }
      }
    }

    const reply = await prisma.$transaction(async (tx) => {
      const created = await tx.directMessage.create({
        data: {
          content,
          fromUserId,
          toUserId,
          threadId: parentId,
          // Self-DMs are auto-read
          ...(fromUserId === toUserId && { readAt: new Date() }),
        },
      });

      if (fileIds && fileIds.length > 0) {
        const updated = await tx.file.updateMany({
          where: { id: { in: fileIds }, userId: fromUserId, messageId: null, dmId: null },
          data: { dmId: created.id },
        });
        if (updated.count !== fileIds.length) {
          throw new Error('Invalid file IDs or files already attached');
        }
      }

      return tx.directMessage.findUnique({
        where: { id: created.id },
        include: DM_INCLUDE_USERS,
      });
    });

    // Broadcast to both users so the thread updates in real-time
    const io = getIO();
    if (io) {
      const payload = { ...reply, threadId: parentId };
      io.to(`user:${fromUserId}`).emit('dm:reply', payload);
      if (fromUserId !== toUserId) {
        io.to(`user:${toUserId}`).emit('dm:reply', payload);
      }
    }

    // Push notification for DM thread reply (fire-and-forget)
    if (reply && fromUserId !== toUserId) {
      if (!isUserOnline(toUserId)) {
        const senderName = reply.fromUser?.name || 'Someone';
        sendPushToUser(toUserId, {
          title: `${senderName} (thread)`,
          body: content.slice(0, 100) || 'Sent an attachment',
          url: `/d/${fromUserId}`,
        }).catch((err) => logError('Push notification dispatch failed', err));
      }
    }

    res.status(201).json(reply);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('DM reply error', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// GET /dms/messages/:id/thread - Get DM thread
router.get('/messages/:id/thread', authMiddleware, requireDmAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = req.dm.id;

    const parent = await prisma.directMessage.findUnique({
      where: { id: parentId },
      include: DM_INCLUDE_USERS,
    });

    if (!parent) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const replies = await prisma.directMessage.findMany({
      where: { threadId: parentId, deletedAt: null },
      include: DM_INCLUDE_USERS,
      orderBy: { createdAt: 'asc' },
    });

    res.json({ parent, replies });
  } catch (error) {
    logError('Get DM thread error', error);
    res.status(500).json({ error: 'Failed to get thread' });
  }
});

// PATCH /dms/messages/:id - Edit a direct message
router.patch('/messages/:id', authMiddleware, requireDmOwnership, async (req: AuthRequest, res: Response) => {
  try {
    const dmId = req.dm.id;

    const contentSchema = z.object({
      content: z.string().min(1).max(MAX_MESSAGE_LENGTH)
        .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' }),
    });
    const { content } = contentSchema.parse(req.body);

    const updated = await prisma.directMessage.update({
      where: { id: dmId },
      data: { content, editedAt: new Date() },
      include: {
        ...DM_INCLUDE_USERS,
      },
    });

    // Broadcast to the other user so the edit appears in real-time
    // (the sender's UI is already updated from the REST response)
    const io = getIO();
    if (io && updated.fromUserId !== updated.toUserId) {
      io.to(`user:${updated.toUserId}`).emit('dm:updated', updated);
    }

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Edit DM error', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /dms/messages/:id - Delete a direct message (soft delete)
router.delete('/messages/:id', authMiddleware, requireDmOwnership, async (req: AuthRequest, res: Response) => {
  try {
    const dm = req.dm;

    await prisma.directMessage.update({
      where: { id: dm.id },
      data: { deletedAt: new Date() },
    });

    // Broadcast to the other user so the deletion appears in real-time
    // (the sender's UI is already updated from the REST response)
    const io = getIO();
    if (io && dm.fromUserId !== dm.toUserId) {
      io.to(`user:${dm.toUserId}`).emit('dm:deleted', {
        dmId: dm.id,
        fromUserId: dm.fromUserId,
        toUserId: dm.toUserId,
      });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    logError('Delete DM error', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Matches either a Unicode emoji sequence or a shortcode (with or without colons)
const emojiShortcodeRegex = /^:?[a-z0-9_+-]+:?$/;
const unicodeEmojiRegex = /^(\p{Regional_Indicator}{2}|(\p{Extended_Pictographic})(\p{Emoji_Modifier}|\uFE0F|\u200d(\p{Extended_Pictographic}))*)+$/u;

const dmReactionSchema = z.object({
  emoji: z.string().min(1).max(32)
    .refine(val => unicodeEmojiRegex.test(val) || emojiShortcodeRegex.test(val), { message: 'Invalid emoji format' }),
});

// POST /dms/messages/:id/reactions - Add reaction to a DM
router.post('/messages/:id/reactions', authMiddleware, requireDmAccess, async (req: AuthRequest, res: Response) => {
  try {
    const dmId = req.dm.id;
    const userId = req.user!.userId;
    const { emoji } = dmReactionSchema.parse(req.body);

    const existing = await prisma.dMReaction.findUnique({
      where: { userId_dmId_emoji: { userId, dmId, emoji } },
    });

    if (existing) {
      res.status(400).json({ error: 'Reaction already exists' });
      return;
    }

    const reaction = await prisma.dMReaction.create({
      data: { emoji, userId, dmId },
      include: { user: { select: { id: true, name: true } } },
    });

    // Broadcast to both DM participants
    const dm = req.dm;
    const io = getIO();
    if (io) {
      const payload = { dmId, reaction: { id: reaction.id, emoji, userId, user: reaction.user } };
      io.to(`user:${dm.fromUserId}`).emit('dm:reaction:added', payload);
      if (dm.fromUserId !== dm.toUserId) {
        io.to(`user:${dm.toUserId}`).emit('dm:reaction:added', payload);
      }
    }

    res.status(201).json(reaction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Add DM reaction error', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// DELETE /dms/messages/:id/reactions/:emoji - Remove reaction from a DM
router.delete('/messages/:id/reactions/:emoji', authMiddleware, requireDmAccess, async (req: AuthRequest, res: Response) => {
  try {
    const dmId = req.dm.id;
    const userId = req.user!.userId;
    const rawEmoji = decodeURIComponent(req.params.emoji as string);

    if (!rawEmoji || rawEmoji.length > 32 || !(unicodeEmojiRegex.test(rawEmoji) || emojiShortcodeRegex.test(rawEmoji))) {
      res.status(400).json({ error: 'Invalid emoji format' });
      return;
    }

    const reaction = await prisma.dMReaction.findUnique({
      where: { userId_dmId_emoji: { userId, dmId, emoji: rawEmoji } },
    });

    if (!reaction) {
      res.status(404).json({ error: 'Reaction not found' });
      return;
    }

    await prisma.dMReaction.delete({ where: { id: reaction.id } });

    const dm = req.dm;
    const io = getIO();
    if (io) {
      const payload = { dmId, emoji: rawEmoji, userId };
      io.to(`user:${dm.fromUserId}`).emit('dm:reaction:removed', payload);
      if (dm.fromUserId !== dm.toUserId) {
        io.to(`user:${dm.toUserId}`).emit('dm:reaction:removed', payload);
      }
    }

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    logError('Remove DM reaction error', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// POST /dms/:userId/read - Mark all messages from a user as read
router.post('/:userId/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const otherUserId = parseIntParam(req.params.userId);
    if (!otherUserId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Guests can only interact with shared-channel members
    if (req.user!.role === 'GUEST' && currentUserId !== otherUserId) {
      const sharedChannel = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT cm1."channelId" AS id
        FROM "ChannelMember" cm1
        JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId"
        WHERE cm1."userId" = ${currentUserId} AND cm2."userId" = ${otherUserId}
        LIMIT 1
      `;
      if (sharedChannel.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    }

    // Mark all unread messages from the other user as read
    const result = await prisma.directMessage.updateMany({
      where: {
        fromUserId: otherUserId,
        toUserId: currentUserId,
        deletedAt: null,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    res.json({ markedAsRead: result.count });
  } catch (error) {
    logError('Mark DMs as read error', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// POST /dms/:userId/unread - Mark DM conversation as unread from a specific message
const markDmUnreadSchema = z.object({
  messageId: z.number().int().positive(),
});

router.post('/:userId/unread', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const otherUserId = parseIntParam(req.params.userId);
    if (!otherUserId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const { messageId } = markDmUnreadSchema.parse(req.body);

    // Guests can only interact with shared-channel members
    if (req.user!.role === 'GUEST') {
      const sharedChannel = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT cm1."channelId" AS id
        FROM "ChannelMember" cm1
        JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId"
        WHERE cm1."userId" = ${currentUserId} AND cm2."userId" = ${otherUserId}
        LIMIT 1
      `;
      if (sharedChannel.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    }

    // Verify the message belongs to this DM conversation
    const targetMessage = await prisma.directMessage.findFirst({
      where: {
        id: messageId,
        fromUserId: otherUserId,
        toUserId: currentUserId,
        deletedAt: null,
      },
    });
    if (!targetMessage) {
      res.status(404).json({ error: 'Message not found in this conversation' });
      return;
    }

    // Set readAt to null on messages from the other user starting from messageId
    const result = await prisma.directMessage.updateMany({
      where: {
        fromUserId: otherUserId,
        toUserId: currentUserId,
        deletedAt: null,
        id: { gte: messageId },
      },
      data: {
        readAt: null,
      },
    });

    res.json({ markedAsUnread: result.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Mark DMs as unread error', error);
    res.status(500).json({ error: 'Failed to mark messages as unread' });
  }
});

// POST /dms/messages/:id/pin - Pin a DM
router.post('/messages/:id/pin', authMiddleware, requireDmAccess, async (req: AuthRequest, res: Response) => {
  try {
    const dmId = parseIntParam(req.params.id);
    if (!dmId) { res.status(400).json({ error: 'Invalid message ID' }); return; }
    const userId = req.user!.userId;

    const updated = await prisma.directMessage.update({
      where: { id: dmId },
      data: { isPinned: true, pinnedBy: userId, pinnedAt: new Date() },
      include: DM_INCLUDE_USERS,
    });

    // Broadcast to both participants
    const io = getIO();
    if (io) {
      const room1 = `dm:${updated.fromUserId}:${updated.toUserId}`;
      const room2 = `dm:${updated.toUserId}:${updated.fromUserId}`;
      io.to(room1).to(room2).emit('dm:updated', updated);
    }

    res.json(updated);
  } catch (error) {
    logError('Pin DM error', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// DELETE /dms/messages/:id/pin - Unpin a DM
router.delete('/messages/:id/pin', authMiddleware, requireDmAccess, async (req: AuthRequest, res: Response) => {
  try {
    const dmId = parseIntParam(req.params.id);
    if (!dmId) { res.status(400).json({ error: 'Invalid message ID' }); return; }

    const updated = await prisma.directMessage.update({
      where: { id: dmId },
      data: { isPinned: false, pinnedBy: null, pinnedAt: null },
      include: DM_INCLUDE_USERS,
    });

    const io = getIO();
    if (io) {
      const room1 = `dm:${updated.fromUserId}:${updated.toUserId}`;
      const room2 = `dm:${updated.toUserId}:${updated.fromUserId}`;
      io.to(room1).to(room2).emit('dm:updated', updated);
    }

    res.json(updated);
  } catch (error) {
    logError('Unpin DM error', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// GET /dms/:userId/pins - Get pinned messages in a DM conversation
router.get('/:userId/pins', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const otherUserId = parseIntParam(req.params.userId);
    if (!otherUserId) { res.status(400).json({ error: 'Invalid user ID' }); return; }

    // Guests can only view pins with shared-channel members
    if (req.user!.role === 'GUEST' && currentUserId !== otherUserId) {
      const sharedChannel = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT cm1."channelId" AS id
        FROM "ChannelMember" cm1
        JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId"
        WHERE cm1."userId" = ${currentUserId} AND cm2."userId" = ${otherUserId}
        LIMIT 1
      `;
      if (sharedChannel.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
    }

    const pinned = await prisma.directMessage.findMany({
      where: {
        isPinned: true,
        deletedAt: null,
        OR: [
          { fromUserId: currentUserId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: currentUserId },
        ],
      },
      include: DM_INCLUDE_USERS,
      orderBy: { pinnedAt: 'desc' },
    });

    res.json(pinned);
  } catch (error) {
    logError('Get pinned DMs error', error);
    res.status(500).json({ error: 'Failed to get pinned messages' });
  }
});

export default router;
