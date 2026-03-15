import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireMessageAccess } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { getIO } from '../websocket/index.js';
import { parseIntParam } from '../utils/params.js';
import { logError } from '../utils/logger.js';

const router = Router();

// Matches either a Unicode emoji sequence or a shortcode (with or without colons)
const emojiShortcodeRegex = /^:?[a-z0-9_+-]+:?$/;
const unicodeEmojiRegex = /^(\p{Regional_Indicator}{2}|(\p{Extended_Pictographic})(\p{Emoji_Modifier}|\uFE0F|\u200d(\p{Extended_Pictographic}))*)+$/u;

const reactionSchema = z.object({
  emoji: z.string().min(1).max(32)
    .refine(val => unicodeEmojiRegex.test(val) || emojiShortcodeRegex.test(val), { message: 'Invalid emoji format' }),
});

// POST /messages/:id/reactions - Add reaction to message
router.post('/:id/reactions', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseIntParam(req.params.id)!;
    const userId = req.user!.userId;
    const { emoji } = reactionSchema.parse(req.body);

    // Block reactions in archived channels
    if (req.channelId) {
      const channel = await prisma.channel.findUnique({
        where: { id: req.channelId },
        select: { archivedAt: true },
      });
      if (channel?.archivedAt) {
        res.status(403).json({ error: 'This channel has been archived' });
        return;
      }
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
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    // Broadcast to channel so other users see the reaction in real-time
    const channelId = req.channelId;
    if (channelId) {
      const io = getIO();
      io?.to(`channel:${channelId}`).emit('reaction:added', {
        messageId,
        reaction: { id: reaction.id, emoji, userId, user: reaction.user },
      });
    }

    res.status(201).json(reaction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Add reaction error', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// DELETE /messages/:id/reactions/:emoji - Remove reaction from message
router.delete('/:id/reactions/:emoji', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseIntParam(req.params.id)!;
    const rawEmoji = decodeURIComponent(req.params.emoji as string);
    const userId = req.user!.userId;

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    // Block reaction removal in archived channels
    if (req.channelId) {
      const channel = await prisma.channel.findUnique({
        where: { id: req.channelId },
        select: { archivedAt: true },
      });
      if (channel?.archivedAt) {
        res.status(403).json({ error: 'This channel has been archived' });
        return;
      }
    }

    // Validate emoji param same as creation route
    if (!rawEmoji || rawEmoji.length > 32 || !(unicodeEmojiRegex.test(rawEmoji) || emojiShortcodeRegex.test(rawEmoji))) {
      res.status(400).json({ error: 'Invalid emoji format' });
      return;
    }
    const emoji = rawEmoji;

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

    // Broadcast to channel so other users see the removal in real-time
    const channelId = req.channelId;
    if (channelId) {
      const io = getIO();
      io?.to(`channel:${channelId}`).emit('reaction:removed', {
        messageId,
        emoji,
        userId,
      });
    }

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    logError('Remove reaction error', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// GET /messages/:id/reactions - Get all reactions for a message
router.get('/:id/reactions', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseIntParam(req.params.id)!;

    const reactions = await prisma.reaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
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
    logError('Get reactions error', error);
    res.status(500).json({ error: 'Failed to get reactions' });
  }
});

export default router;
