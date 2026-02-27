import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

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

    if (fromUserId === toUserId) {
      res.status(400).json({ error: 'Cannot send DM to yourself' });
      return;
    }

    // Check if recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: toUserId },
    });

    if (!recipient) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    const dm = await prisma.directMessage.create({
      data: {
        content,
        fromUserId,
        toUserId,
      },
      include: {
        fromUser: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        toUser: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
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

    // Get all users the current user has DM conversations with
    const sentDMs = await prisma.directMessage.findMany({
      where: {
        fromUserId: userId,
        deletedAt: null,
      },
      select: { toUserId: true },
      distinct: ['toUserId'],
    });

    const receivedDMs = await prisma.directMessage.findMany({
      where: {
        toUserId: userId,
        deletedAt: null,
      },
      select: { fromUserId: true },
      distinct: ['fromUserId'],
    });

    // Get unique user IDs
    const userIds = new Set<number>();
    sentDMs.forEach((dm) => userIds.add(dm.toUserId));
    receivedDMs.forEach((dm) => userIds.add(dm.fromUserId));

    // Get conversations with each user
    const conversations = await Promise.all(
      Array.from(userIds).map(async (otherUserId) => {
        const user = await prisma.user.findUnique({
          where: { id: otherUserId },
          select: { id: true, name: true, email: true, avatar: true, status: true },
        });

        // Get the last message
        const lastMessage = await prisma.directMessage.findFirst({
          where: {
            OR: [
              { fromUserId: userId, toUserId: otherUserId },
              { fromUserId: otherUserId, toUserId: userId },
            ],
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        // Count unread messages (messages sent TO the current user that haven't been read)
        const unreadCount = await prisma.directMessage.count({
          where: {
            fromUserId: otherUserId,
            toUserId: userId,
            deletedAt: null,
            readAt: null,
          },
        });

        return {
          user,
          lastMessage,
          unreadCount,
        };
      })
    );

    // Sort by last message date
    conversations.sort((a, b) => {
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime();
    });

    res.json(conversations);
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
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : undefined;

    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { fromUserId: currentUserId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: currentUserId },
        ],
        deletedAt: null,
      },
      include: {
        fromUser: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        toUser: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? resultMessages[resultMessages.length - 1]?.id : undefined;

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

// POST /dms/:userId/read - Mark all messages from a user as read
router.post('/:userId/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const otherUserId = parseInt(req.params.userId);

    if (isNaN(otherUserId)) {
      res.status(400).json({ error: 'Invalid user ID' });
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
