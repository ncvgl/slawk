import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

const createMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  threadId: z.number().optional(),
});

// POST /channels/:id/messages - Send message
router.post('/:id/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const { content, threadId } = createMessageSchema.parse(req.body);

    // Check if user is a member of the channel
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId },
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'You must join the channel to send messages' });
      return;
    }

    const message = await prisma.message.create({
      data: {
        content,
        userId,
        channelId,
        threadId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /channels/:id/messages - Get messages (paginated)
router.get('/:id/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : undefined;

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        threadId: null, // Only get top-level messages
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
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

    res.json({
      messages: resultMessages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

export default router;
