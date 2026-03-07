import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { AuthRequest } from '../types.js';
import { getIO, kickUser } from '../websocket/index.js';
import { parseIntParam } from '../utils/params.js';
import { logError } from '../utils/logger.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(authMiddleware, requireAdmin);

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  status: true,
  deactivatedAt: true,
  createdAt: true,
} as const;

// GET /admin/users - List all users
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: ADMIN_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (error) {
    logError('Admin list users error', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// PATCH /admin/users/:id - Change user role
const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']),
});

router.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseIntParam(req.params.id);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    if (userId === req.user!.userId) {
      res.status(400).json({ error: 'Cannot modify your own role' });
      return;
    }

    const { role } = updateRoleSchema.parse(req.body);

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (target.role === 'ADMIN') {
      res.status(400).json({ error: 'Cannot modify another admin' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: ADMIN_USER_SELECT,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Admin update role error', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// POST /admin/users/:id/deactivate - Deactivate user
router.post('/users/:id/deactivate', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseIntParam(req.params.id);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    if (userId === req.user!.userId) {
      res.status(400).json({ error: 'Cannot deactivate yourself' });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (target.role === 'ADMIN') {
      res.status(400).json({ error: 'Cannot deactivate another admin' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        deactivatedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
      select: ADMIN_USER_SELECT,
    });

    kickUser(userId);

    res.json(updated);
  } catch (error) {
    logError('Admin deactivate user error', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// POST /admin/users/:id/reactivate - Reactivate user
router.post('/users/:id/reactivate', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseIntParam(req.params.id);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { deactivatedAt: null },
      select: ADMIN_USER_SELECT,
    });

    res.json(updated);
  } catch (error) {
    logError('Admin reactivate user error', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

// GET /admin/invites - List all invite links
router.get('/invites', async (_req: AuthRequest, res: Response) => {
  try {
    const invites = await prisma.inviteLink.findMany({
      include: {
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invites);
  } catch (error) {
    logError('Admin list invites error', error);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

// POST /admin/invites - Create invite link
const createInviteSchema = z.object({
  role: z.enum(['MEMBER', 'GUEST']).optional().default('MEMBER'),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

router.post('/invites', async (req: AuthRequest, res: Response) => {
  try {
    const { role, maxUses, expiresAt } = createInviteSchema.parse(req.body);

    const code = crypto.randomBytes(32).toString('hex');

    const invite = await prisma.inviteLink.create({
      data: {
        code,
        createdBy: req.user!.userId,
        role,
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        creator: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(invite);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Admin create invite error', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// DELETE /admin/invites/:id - Delete invite link
router.delete('/invites/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid invite ID' });
      return;
    }

    await prisma.inviteLink.delete({ where: { id } });
    res.json({ message: 'Invite deleted' });
  } catch (error) {
    logError('Admin delete invite error', error);
    res.status(500).json({ error: 'Failed to delete invite' });
  }
});

// GET /admin/channels - List all channels with counts
router.get('/channels', async (_req: AuthRequest, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      include: {
        _count: {
          select: { members: true, messages: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(channels);
  } catch (error) {
    logError('Admin list channels error', error);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

// DELETE /admin/channels/:id - Delete a channel
router.delete('/channels/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }

    await prisma.channel.delete({ where: { id } });

    const io = getIO();
    if (io) {
      io.emit('channel:deleted', { channelId: id });
      // Evict all sockets from the deleted channel room
      io.in(`channel:${id}`).socketsLeave(`channel:${id}`);
    }

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    logError('Admin delete channel error', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// GET /admin/channels/:id/members - List members of any channel
router.get('/channels/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseIntParam(req.params.id);
    if (!channelId) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }

    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    res.json(members);
  } catch (error) {
    logError('Admin list channel members error', error);
    res.status(500).json({ error: 'Failed to list channel members' });
  }
});

// POST /admin/channels/:id/members - Add user to any channel
const addMemberSchema = z.object({
  userId: z.number().int().positive(),
});

router.post('/channels/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseIntParam(req.params.id);
    if (!channelId) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }

    const { userId } = addMemberSchema.parse(req.body);

    await prisma.channelMember.create({
      data: { userId, channelId },
    });

    res.json({ message: 'Member added' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Admin add channel member error', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /admin/channels/:id/members/:userId - Remove user from any channel
router.delete('/channels/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseIntParam(req.params.id);
    const userId = parseIntParam(req.params.userId);
    if (!channelId || !userId) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    await prisma.channelMember.delete({
      where: { userId_channelId: { userId, channelId } },
    });

    res.json({ message: 'Member removed' });
  } catch (error) {
    logError('Admin remove channel member error', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
