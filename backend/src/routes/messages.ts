import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireChannelMembership, requirePublicChannelReadAccess } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { USER_SELECT_BASIC, FILE_SELECT, MESSAGE_INCLUDE_FULL, MESSAGE_INCLUDE_WITH_FILES } from '../db/selects.js';
import { parsePagination, paginateResults } from '../utils/pagination.js';
import { logError } from '../utils/logger.js';

const router = Router();

const createMessageSchema = z.object({
  content: z.string()
    .max(4000)
    .refine(
      (val) => !val.includes('\u0000'),
      { message: 'Message content cannot contain null bytes' }
    ),
  threadId: z.number().optional(),
  fileIds: z.array(z.number()).max(10).optional(),
}).refine(
  (data) => (data.content?.trim().length ?? 0) > 0 || (data.fileIds && data.fileIds.length > 0),
  { message: 'Message must have content or file attachments' },
);

// POST /channels/:id/messages - Send message
router.post('/:id/messages', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const userId = req.user!.userId;
    const { content, threadId, fileIds } = createMessageSchema.parse(req.body);

    // Validate threadId belongs to the same channel (prevent cross-channel thread injection)
    if (threadId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: threadId },
      });
      if (!parentMessage || parentMessage.channelId !== channelId) {
        res.status(400).json({ error: 'Thread parent must belong to the same channel' });
        return;
      }
    }

    // Create message and atomically attach files in a transaction
    const finalMessage = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          content,
          userId,
          channelId,
          threadId,
        },
      });

      if (fileIds && fileIds.length > 0) {
        const updated = await tx.file.updateMany({
          where: { id: { in: fileIds }, userId, messageId: null },
          data: { messageId: msg.id },
        });
        if (updated.count !== fileIds.length) {
          throw new Error('Invalid file IDs or files already attached');
        }
      }

      return tx.message.findUnique({
        where: { id: msg.id },
        include: MESSAGE_INCLUDE_WITH_FILES,
      });
    });

    res.status(201).json(finalMessage);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    if (error instanceof Error && error.message.includes('Invalid file IDs')) {
      res.status(400).json({ error: error.message });
      return;
    }
    logError('Send message error', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /channels/:id/messages - Get messages (paginated)
router.get('/:id/messages', authMiddleware, requirePublicChannelReadAccess, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const { limit, cursor } = parsePagination(req);

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        threadId: null, // Only get top-level messages
        deletedAt: null, // Exclude deleted messages
      },
      include: {
        ...MESSAGE_INCLUDE_FULL,
        replies: {
          select: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
          distinct: ['userId'],
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const { results: resultMessages, nextCursor, hasMore } = paginateResults(messages, limit);

    // Extract unique thread participants from replies
    const enrichedMessages = resultMessages.map((msg) => {
      const { replies, ...rest } = msg;
      const threadParticipants = replies
        ? replies.map((r: { user: { id: number; name: string; avatar: string | null } }) => r.user)
        : [];
      return { ...rest, threadParticipants };
    });

    res.json({
      messages: enrichedMessages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    logError('Get messages error', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

export default router;
