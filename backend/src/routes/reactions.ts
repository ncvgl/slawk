import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

// POST /messages/:id/reactions - Add reaction to message
router.post('/:id/reactions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const { emoji } = reactionSchema.parse(req.body);

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    // Check if message exists
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Check if user is a member of the channel
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId: message.channelId },
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'You must be a member of the channel' });
      return;
    }

    // Check if reaction already exists
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: { userId, messageId, emoji },
      },
    });

    if (existingReaction) {
      res.status(400).json({ error: 'Reaction already exists' });
      return;
    }

    const reaction = await prisma.reaction.create({
      data: {
        emoji,
        userId,
        messageId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(reaction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// DELETE /messages/:id/reactions/:emoji - Remove reaction from message
router.delete('/:id/reactions/:emoji', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const emoji = decodeURIComponent(req.params.emoji);
    const userId = req.user!.userId;

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const reaction = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: { userId, messageId, emoji },
      },
    });

    if (!reaction) {
      res.status(404).json({ error: 'Reaction not found' });
      return;
    }

    await prisma.reaction.delete({
      where: { id: reaction.id },
    });

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// GET /messages/:id/reactions - Get all reactions for a message
router.get('/:id/reactions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const reactions = await prisma.reaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group reactions by emoji
    const grouped = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push(reaction.user);
      return acc;
    }, {} as Record<string, { emoji: string; count: number; users: any[] }>);

    res.json(Object.values(grouped));
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ error: 'Failed to get reactions' });
  }
});

export default router;
