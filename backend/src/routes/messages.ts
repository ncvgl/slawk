import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

const createMessageSchema = z.object({
  content: z.string()
    .min(1)
    .max(4000)
    .refine(
      (val) => val.trim().length > 0,
      { message: 'Message content cannot be empty or whitespace only' }
    )
    .refine(
      (val) => !val.includes('\u0000'),
      { message: 'Message content cannot contain null bytes' }
    ),
  threadId: z.number().optional(),
  fileIds: z.array(z.number()).optional(),
});

// POST /channels/:id/messages - Send message
router.post('/:id/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const { content, threadId, fileIds } = createMessageSchema.parse(req.body);

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

    // Validate fileIds belong to the user and are not already attached
    if (fileIds && fileIds.length > 0) {
      const files = await prisma.file.findMany({
        where: {
          id: { in: fileIds },
          userId,
          messageId: null, // Only unattached files
        },
      });

      if (files.length !== fileIds.length) {
        res.status(400).json({ error: 'Invalid file IDs or files already attached' });
        return;
      }
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
        files: {
          select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true },
        },
      },
    });

    // Attach files to the message
    if (fileIds && fileIds.length > 0) {
      await prisma.file.updateMany({
        where: { id: { in: fileIds }, userId },
        data: { messageId: message.id },
      });

      // Fetch updated message with files
      const updatedMessage = await prisma.message.findUnique({
        where: { id: message.id },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          files: {
            select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true },
          },
        },
      });

      res.status(201).json(updatedMessage);
      return;
    }

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
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : undefined;

    // Check if user is a member of the channel
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId },
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'You must be a member of this channel' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        threadId: null, // Only get top-level messages
        deletedAt: null, // Exclude deleted messages
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        files: {
          select: { id: true, filename: true, mimetype: true, size: true, url: true },
        },
        _count: {
          select: { replies: true },
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
