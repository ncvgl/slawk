import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireMessageAccess } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { getIO } from '../websocket/index.js';

const router = Router();

const replySchema = z.object({
  content: z.string().min(1).max(4000),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

// POST /messages/:id/reply - Reply to message (creates thread)
router.post('/:id/reply', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const { content } = replySchema.parse(req.body);
    const parentMessage = req.message;

    // Prevent nested threads - cannot reply to a reply
    if (parentMessage.threadId !== null) {
      res.status(400).json({ error: 'Cannot reply to a reply. Reply to the parent message instead.' });
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
          select: { id: true, name: true, email: true, avatar: true },
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
router.get('/:id/thread', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parentId = parseInt(req.params.id);

    // Re-fetch parent with user details for the response
    const parentMessage = await prisma.message.findUnique({
      where: { id: parentId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    if (!parentMessage) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const replies = await prisma.message.findMany({
      where: { threadId: parentId, deletedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
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

// PATCH /messages/:id - Edit message
router.patch('/:id', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const { content } = editMessageSchema.parse(req.body);
    const message = req.message;

    if (message.userId !== userId) {
      res.status(403).json({ error: 'You can only edit your own messages' });
      return;
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
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
      },
    });

    res.json(updatedMessage);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /messages/:id - Soft delete message
router.delete('/:id', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const message = req.message;

    if (message.userId !== userId) {
      res.status(403).json({ error: 'You can only delete your own messages' });
      return;
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /messages/:id/pin - Pin a message
router.post('/:id/pin', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true, pinnedBy: userId, pinnedAt: new Date() },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        files: { select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true } },
        _count: { select: { replies: true } },
      },
    });

    // Broadcast the updated message to all users in the channel
    const io = getIO();
    if (io) {
      io.to(`channel:${updated.channelId}`).emit('message:updated', updated);
    }

    res.json(updated);
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// DELETE /messages/:id/pin - Unpin a message
router.delete('/:id/pin', authMiddleware, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const message = req.message;

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false, pinnedBy: null, pinnedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        files: { select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true } },
        _count: { select: { replies: true } },
      },
    });

    // Broadcast the updated message to all users in the channel
    const io = getIO();
    if (io) {
      io.to(`channel:${updated.channelId}`).emit('message:updated', updated);
    }

    res.json(updated);
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// GET /channels/:channelId/pins - Get pinned messages (mounted on /channels)
// NOTE: This is added in channels routes

export default router;
