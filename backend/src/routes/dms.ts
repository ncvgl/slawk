import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDmOwnership } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { isUserOnline } from '../websocket/index.js';
import { USER_SELECT_BASIC, DM_INCLUDE_USERS } from '../db/selects.js';
import { parsePagination, paginateResults } from '../utils/pagination.js';

const router = Router();

const sendDMSchema = z.object({
  toUserId: z.number().int().positive(),
  content: z.string().min(1).max(4000),
});

// POST /dms - Send a direct message
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const fromUserId = req.user!.userId;
    const { toUserId, content } = sendDMSchema.parse(req.body);

    // Check if recipient exists (self-DM is allowed)
    if (fromUserId !== toUserId) {
      const recipient = await prisma.user.findUnique({
        where: { id: toUserId },
      });

      if (!recipient) {
        res.status(400).json({ error: 'Unable to send message' });
        return;
      }
    }

    const dm = await prisma.directMessage.create({
      data: {
        content,
        fromUserId,
        toUserId,
        // Self-DMs are auto-read (no notifications for yourself)
        ...(fromUserId === toUserId && { readAt: new Date() }),
      },
      include: DM_INCLUDE_USERS,
    });

    res.status(201).json(dm);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Send DM error:', error);
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
          'id', u.id, 'name', u.name, 'email', u.email, 'avatar', u.avatar, 'status', u.status
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

    // Apply online status from WebSocket tracking
    const result = conversations.map((conv) => ({
      otherUser: conv.otherUser ? {
        ...conv.otherUser,
        status: isUserOnline(conv.otherUser.id) ? 'online' : 'offline',
      } : conv.otherUser,
      lastMessage: conv.lastMessage,
      unreadCount: Number(conv.unreadCount),
    }));

    res.json(result);
  } catch (error) {
    console.error('Get DM conversations error:', error);
    res.status(500).json({ error: 'Failed to get DM conversations' });
  }
});

// GET /dms/:userId - Get DM conversation with specific user
router.get('/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const otherUserId = parseInt(req.params.userId);

    if (isNaN(otherUserId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Check if the other user exists
    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, name: true, email: true, avatar: true, status: true },
    });

    if (!otherUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get messages between the two users
    const { limit, cursor } = parsePagination(req);

    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { fromUserId: currentUserId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: currentUserId },
        ],
        deletedAt: null,
      },
      include: DM_INCLUDE_USERS,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const { results: resultMessages, nextCursor, hasMore } = paginateResults(messages, limit);

    // Mark messages from the other user as read
    await prisma.directMessage.updateMany({
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

    res.json({
      user: otherUser,
      messages: resultMessages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('Get DM conversation error:', error);
    res.status(500).json({ error: 'Failed to get DM conversation' });
  }
});

// PATCH /dms/messages/:id - Edit a direct message
router.patch('/messages/:id', authMiddleware, requireDmOwnership, async (req: AuthRequest, res: Response) => {
  try {
    const dmId = req.dm.id;

    const contentSchema = z.object({ content: z.string().min(1).max(4000) });
    const { content } = contentSchema.parse(req.body);

    const updated = await prisma.directMessage.update({
      where: { id: dmId },
      data: { content, editedAt: new Date() },
      include: {
        ...DM_INCLUDE_USERS,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Edit DM error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /dms/messages/:id - Delete a direct message (soft delete)
router.delete('/messages/:id', authMiddleware, requireDmOwnership, async (req: AuthRequest, res: Response) => {
  try {
    const dmId = req.dm.id;

    await prisma.directMessage.update({
      where: { id: dmId },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete DM error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /dms/:userId/read - Mark all messages from a user as read
router.post('/:userId/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const otherUserId = parseInt(req.params.userId);

    if (isNaN(otherUserId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: otherUserId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
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
    console.error('Mark DMs as read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

export default router;
