import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

const replySchema = z.object({
  content: z.string().min(1).max(4000),
});

// POST /messages/:id/reply - Reply to message (creates thread)
router.post('/:id/reply', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const { content } = replySchema.parse(req.body);

    if (isNaN(parentId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const parentMessage = await prisma.message.findUnique({
      where: { id: parentId },
    });

    if (!parentMessage) {
      res.status(404).json({ error: 'Parent message not found' });
      return;
    }

    // Check if user is a member of the channel
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId: parentMessage.channelId },
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'You must join the channel to reply' });
      return;
    }

    const reply = await prisma.message.create({
      data: {
        content,
        userId,
        channelId: parentMessage.channelId,
        threadId: parentId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(reply);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Reply error:', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// GET /messages/:id/thread - Get thread messages
router.get('/:id/thread', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = parseInt(req.params.id);

    if (isNaN(parentId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const parentMessage = await prisma.message.findUnique({
      where: { id: parentId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!parentMessage) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const replies = await prisma.message.findMany({
      where: { threadId: parentId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      parent: parentMessage,
      replies,
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: 'Failed to get thread' });
  }
});

export default router;
