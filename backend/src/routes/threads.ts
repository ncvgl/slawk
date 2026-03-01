import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

const replySchema = z.object({
  content: z.string().min(1).max(4000),
});

const editMessageSchema = z.object({
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

    // Prevent nested threads - cannot reply to a reply
    if (parentMessage.threadId !== null) {
      res.status(400).json({ error: 'Cannot reply to a reply. Reply to the parent message instead.' });
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

    if (!parentMessage || parentMessage.deletedAt) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const replies = await prisma.message.findMany({
      where: { threadId: parentId, deletedAt: null },
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

// PATCH /messages/:id - Edit message
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const { content } = editMessageSchema.parse(req.body);

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (message.deletedAt) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (message.userId !== userId) {
      res.status(403).json({ error: 'You can only edit your own messages' });
      return;
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { content },
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
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (message.deletedAt) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

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
router.post('/:id/pin', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.deletedAt) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Check membership
    const membership = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId: message.channelId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'You must be a member of this channel' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true, pinnedBy: userId, pinnedAt: new Date() },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        files: { select: { id: true, filename: true, mimetype: true, size: true, url: true } },
        _count: { select: { replies: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// DELETE /messages/:id/pin - Unpin a message
router.delete('/:id/pin', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.deletedAt) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const membership = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId: message.channelId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'You must be a member of this channel' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false, pinnedBy: null, pinnedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        files: { select: { id: true, filename: true, mimetype: true, size: true, url: true } },
        _count: { select: { replies: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// GET /channels/:channelId/pins - Get pinned messages (mounted on /channels)
// NOTE: This is added in channels routes

export default router;
