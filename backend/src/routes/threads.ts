import { Router, Response } from 'express';
import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '../utils/params.js';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireMessageAccess, requirePublicMessageReadAccess } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { getIO } from '../websocket/index.js';
import { USER_SELECT_BASIC, MESSAGE_INCLUDE_FULL, MESSAGE_INCLUDE_WITH_FILES, THREAD_REPLY_INCLUDE } from '../db/selects.js';
import { parseIntParam } from '../utils/params.js';
import { logError } from '../utils/logger.js';
import { isUserOnline } from '../websocket/index.js';
import { sendPushToUser } from '../services/pushService.js';

const router = Router();

const replySchema = z.object({
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH)
    .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' }),
  fileIds: z.array(z.number().int().positive()).max(10).optional(),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH)
    .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' }),
});

// POST /messages/:id/reply - Reply to message (creates thread)
router.post('/:id/reply', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = parseIntParam(req.params.id)!;
    const userId = req.user!.userId;
    const { content, fileIds } = replySchema.parse(req.body);
    const parentMessage = req.message;

    // Prevent nested threads - cannot reply to a reply
    if (parentMessage.threadId !== null) {
      res.status(400).json({ error: 'Cannot reply to a reply. Reply to the parent message instead.' });
      return;
    }

    // Block replies in archived channels
    const channel = await prisma.channel.findUnique({
      where: { id: parentMessage.channelId },
      select: { archivedAt: true },
    });
    if (channel?.archivedAt) {
      res.status(403).json({ error: 'This channel has been archived' });
      return;
    }

    const reply = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          content,
          userId,
          channelId: parentMessage.channelId,
          threadId: parentId,
        },
      });

      if (fileIds && fileIds.length > 0) {
        const updated = await tx.file.updateMany({
          where: { id: { in: fileIds }, userId, messageId: null, dmId: null },
          data: { messageId: msg.id },
        });
        if (updated.count !== fileIds.length) {
          throw new Error('Invalid file IDs or files already attached');
        }
      }

      return tx.message.findUnique({
        where: { id: msg.id },
        include: THREAD_REPLY_INCLUDE,
      });
    });

    // Broadcast to channel so other users see the thread count update
    const io = getIO();
    if (io && reply) {
      io.to(`channel:${parentMessage.channelId}`).emit('message:new', { ...reply, threadId: parentId });
    }

    // Push to thread participants (fire-and-forget)
    if (reply) {
      const channelInfo = await prisma.channel.findUnique({
        where: { id: parentMessage.channelId },
        select: { name: true },
      });
      const senderName = reply.user?.name || 'Someone';
      const channelName = channelInfo?.name || 'channel';

      // Get distinct thread participants (parent author + all repliers)
      const participants = await prisma.message.findMany({
        where: {
          OR: [{ id: parentId }, { threadId: parentId }],
          deletedAt: null,
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      for (const p of participants) {
        if (p.userId === userId) continue;
        if (isUserOnline(p.userId)) continue;
        sendPushToUser(p.userId, {
          title: `#${channelName} thread`,
          body: `${senderName}: ${content.slice(0, 100)}`,
          url: `/c/${parentMessage.channelId}`,
        }).catch((err) => logError('Push notification dispatch failed', err));
      }
    }

    res.status(201).json(reply);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Reply error', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// GET /messages/:id/thread - Get thread messages
router.get('/:id/thread', authMiddleware, requirePublicMessageReadAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = parseIntParam(req.params.id)!;

    // Re-fetch parent with user details for the response
    const parentMessage = await prisma.message.findUnique({
      where: { id: parentId },
      include: THREAD_REPLY_INCLUDE,
    });

    if (!parentMessage) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const replies = await prisma.message.findMany({
      where: { threadId: parentId, deletedAt: null },
      include: THREAD_REPLY_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      parent: parentMessage,
      replies,
    });
  } catch (error) {
    logError('Get thread error', error);
    res.status(500).json({ error: 'Failed to get thread' });
  }
});

// PATCH /messages/:id - Edit message
router.patch('/:id', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseIntParam(req.params.id)!;
    const userId = req.user!.userId;
    const { content } = editMessageSchema.parse(req.body);
    const message = req.message;

    if (message.userId !== userId) {
      res.status(403).json({ error: 'You can only edit your own messages' });
      return;
    }

    // Block edits in archived channels
    const channel = await prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { archivedAt: true },
    });
    if (channel?.archivedAt) {
      res.status(403).json({ error: 'This channel has been archived' });
      return;
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: {
        user: { select: USER_SELECT_BASIC },
        reactions: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    res.json(updatedMessage);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Edit message error', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /messages/:id - Soft delete message
router.delete('/:id', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseIntParam(req.params.id)!;
    const userId = req.user!.userId;
    const message = req.message;

    if (message.userId !== userId) {
      res.status(403).json({ error: 'You can only delete your own messages' });
      return;
    }

    // Block deletes in archived channels
    const channel = await prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { archivedAt: true },
    });
    if (channel?.archivedAt) {
      res.status(403).json({ error: 'This channel has been archived' });
      return;
    }

    // Soft-delete message and detach its files so they don't become orphaned
    await prisma.$transaction([
      prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      }),
      prisma.file.updateMany({
        where: { messageId },
        data: { messageId: null },
      }),
    ]);

    // Broadcast deletion to channel so other clients update in real-time
    const io = getIO();
    if (io) {
      io.to(`channel:${message.channelId}`).emit('message:deleted', {
        messageId,
        threadId: message.threadId ?? null,
        channelId: message.channelId,
      });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    logError('Delete message error', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /messages/:id/pin - Pin a message
router.post('/:id/pin', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseIntParam(req.params.id)!;
    const userId = req.user!.userId;
    const message = req.message;

    // Block pinning in archived channels
    const pinChannel = await prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { archivedAt: true },
    });
    if (pinChannel?.archivedAt) {
      res.status(403).json({ error: 'This channel has been archived' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true, pinnedBy: userId, pinnedAt: new Date() },
      include: MESSAGE_INCLUDE_FULL,
    });

    // Broadcast the updated message to all users in the channel
    const io = getIO();
    if (io) {
      io.to(`channel:${updated.channelId}`).emit('message:updated', updated);
    }

    res.json(updated);
  } catch (error) {
    logError('Pin message error', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// DELETE /messages/:id/pin - Unpin a message
router.delete('/:id/pin', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseIntParam(req.params.id)!;
    const userId = req.user!.userId;
    const message = req.message;

    // Block unpinning in archived channels
    const unpinChannel = await prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { archivedAt: true },
    });
    if (unpinChannel?.archivedAt) {
      res.status(403).json({ error: 'This channel has been archived' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false, pinnedBy: null, pinnedAt: null },
      include: MESSAGE_INCLUDE_FULL,
    });

    // Broadcast the updated message to all users in the channel
    const io = getIO();
    if (io) {
      io.to(`channel:${updated.channelId}`).emit('message:updated', updated);
    }

    res.json(updated);
  } catch (error) {
    logError('Unpin message error', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// GET /channels/:channelId/pins - Get pinned messages (mounted on /channels)
// NOTE: This is added in channels routes

export default router;
