import { Router, Response } from 'express';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

// POST /messages/:id/bookmark - Bookmark a message
router.post('/:id/bookmark', authMiddleware, async (req: AuthRequest, res: Response) => {
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

    if (!message || message.deletedAt !== null) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const existing = await prisma.bookmark.findUnique({
      where: { userId_messageId: { userId, messageId } },
    });

    if (existing) {
      res.status(400).json({ error: 'Already bookmarked' });
      return;
    }

    const bookmark = await prisma.bookmark.create({
      data: { userId, messageId },
    });

    res.status(201).json(bookmark);
  } catch (error) {
    console.error('Add bookmark error:', error);
    res.status(500).json({ error: 'Failed to add bookmark' });
  }
});

// DELETE /messages/:id/bookmark - Remove bookmark
router.delete('/:id/bookmark', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user!.userId;

    if (isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const bookmark = await prisma.bookmark.findUnique({
      where: { userId_messageId: { userId, messageId } },
    });

    if (!bookmark) {
      res.status(404).json({ error: 'Bookmark not found' });
      return;
    }

    await prisma.bookmark.delete({
      where: { id: bookmark.id },
    });

    res.json({ message: 'Bookmark removed' });
  } catch (error) {
    console.error('Remove bookmark error:', error);
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
});

// GET /bookmarks - Get all bookmarked message IDs for the current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      select: { messageId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(bookmarks);
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ error: 'Failed to get bookmarks' });
  }
});

export default router;
