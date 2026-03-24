import { Router, Response } from 'express';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';
import { USER_SELECT_BASIC, FILE_SELECT } from '../db/selects.js';
import { parsePagination, paginateResults } from '../utils/pagination.js';
import { logError } from '../utils/logger.js';

const router = Router();

// GET /unreads - Get all unread messages across all channels
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { limit, cursor } = parsePagination(req);

    // Get channels the user is a member of
    const memberChannelIds = (await prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true },
    })).map(m => m.channelId);

    if (memberChannelIds.length === 0) {
      res.json({ messages: [], nextCursor: undefined, hasMore: false });
      return;
    }

    // Get all ChannelRead records for the user
    const channelReads = await prisma.channelRead.findMany({
      where: {
        userId,
        channelId: { in: memberChannelIds },
      },
      select: {
        channelId: true,
        lastReadMessageId: true,
      },
    });

    // Build a map of channelId -> lastReadMessageId
    const lastReadMap = new Map<number, number | null>();
    for (const cr of channelReads) {
      lastReadMap.set(cr.channelId, cr.lastReadMessageId);
    }

    // For channels without a ChannelRead record, all messages are unread (lastReadMessageId = null)
    for (const channelId of memberChannelIds) {
      if (!lastReadMap.has(channelId)) {
        lastReadMap.set(channelId, null);
      }
    }

    // Build WHERE conditions for unread messages
    // For each channel, we need: (channelId = X AND (lastReadMessageId IS NULL OR id > lastReadMessageId))
    const channelConditions = memberChannelIds.map(channelId => {
      const lastReadMessageId = lastReadMap.get(channelId);
      if (lastReadMessageId === null || lastReadMessageId === undefined) {
        // All messages in this channel are unread
        return { channelId };
      } else {
        // Only messages with id > lastReadMessageId are unread
        return {
          channelId,
          id: { gt: lastReadMessageId },
        };
      }
    });

    // Query unread messages
    const messages = await prisma.message.findMany({
      where: {
        OR: channelConditions,
        threadId: null, // Only top-level messages
        deletedAt: null, // Exclude deleted messages
      },
      include: {
        user: { select: USER_SELECT_BASIC },
        files: { select: FILE_SELECT },
        channel: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const { results: resultMessages, nextCursor, hasMore } = paginateResults(messages, limit);

    res.json({
      messages: resultMessages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    logError('Get unreads error', error);
    res.status(500).json({ error: 'Failed to get unread messages' });
  }
});

export default router;
