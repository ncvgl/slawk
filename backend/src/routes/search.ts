import { Router, Response } from 'express';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

// GET /search - Search messages
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    const userId = req.user!.userId;

    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    // Get channels user is a member of
    const userChannels = await prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true },
    });

    const channelIds = userChannels.map((c) => c.channelId);

    if (channelIds.length === 0) {
      res.json([]);
      return;
    }

    const messages = await prisma.message.findMany({
      where: {
        channelId: { in: channelIds },
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        channel: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(messages);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

export default router;
