import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional().nullable(),
  status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
  bio: z.string().max(500).optional().nullable(),
});

// GET /users/me - Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            messages: true,
            channels: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PATCH /users/me - Update current user profile
router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const updates = updateProfileSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /users/:id - Get user by ID
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// GET /users - List users (for searching/mentioning)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    res.json(users);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// PUT /users/me/status - Update user status
router.put('/me/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { status } = z.object({
      status: z.enum(['online', 'away', 'busy', 'offline']),
    }).parse(req.body);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        status: true,
      },
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
