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
import { writeAuditLog } from '../utils/auditLog.js';

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

// Role hierarchy: OWNER > ADMIN > MEMBER > GUEST
const ROLE_RANK: Record<string, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1, GUEST: 0 };

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
    const actorRole = req.user!.role || 'MEMBER';

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot modify someone at or above your rank (unless you're OWNER)
    if (actorRole !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[actorRole]) {
      res.status(403).json({ error: 'Cannot modify a user with equal or higher role' });
      return;
    }

    // Only OWNER can promote to ADMIN
    if (role === 'ADMIN' && actorRole !== 'OWNER') {
      res.status(403).json({ error: 'Only the workspace owner can promote to admin' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: ADMIN_USER_SELECT,
    });

    writeAuditLog({
      action: 'user.role_changed',
      actorId: req.user!.userId,
      targetType: 'user',
      targetId: userId,
      targetName: updated.name,
      details: `Role changed from ${target.role} to ${role}`,
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

    const actorRole = req.user!.role || 'MEMBER';
    if (target.role === 'OWNER') {
      res.status(403).json({ error: 'Cannot deactivate the workspace owner' });
      return;
    }
    if (actorRole !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[actorRole]) {
      res.status(403).json({ error: 'Cannot deactivate a user with equal or higher role' });
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

    writeAuditLog({
      action: 'user.deactivated',
      actorId: req.user!.userId,
      targetType: 'user',
      targetId: userId,
      targetName: updated.name,
    });

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
      select: { id: true, role: true },
    });
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Enforce same role hierarchy as deactivation:
    // only OWNER can reactivate ADMIN-level users; an ADMIN cannot
    // reactivate someone at or above their own rank.
    const actorRole = req.user!.role || 'MEMBER';
    if (actorRole !== 'OWNER' && ROLE_RANK[target.role] >= ROLE_RANK[actorRole]) {
      res.status(403).json({ error: 'Cannot reactivate a user with equal or higher role' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { deactivatedAt: null },
      select: ADMIN_USER_SELECT,
    });

    writeAuditLog({
      action: 'user.reactivated',
      actorId: req.user!.userId,
      targetType: 'user',
      targetId: userId,
      targetName: updated.name,
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

    writeAuditLog({
      action: 'invite.created',
      actorId: req.user!.userId,
      targetType: 'invite',
      targetId: invite.id,
      details: `Role: ${role}, Max uses: ${maxUses ?? 'unlimited'}, Expires: ${expiresAt ?? 'never'}`,
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

    writeAuditLog({
      action: 'invite.deleted',
      actorId: req.user!.userId,
      targetType: 'invite',
      targetId: id,
    });

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

// DELETE /admin/channels/:id - Delete a channel (permanent)
router.delete('/channels/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }

    const channel = await prisma.channel.findUnique({ where: { id }, select: { name: true } });
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    await prisma.channel.delete({ where: { id } });

    const io = getIO();
    if (io) {
      io.emit('channel:deleted', { channelId: id });
      io.in(`channel:${id}`).socketsLeave(`channel:${id}`);
    }

    writeAuditLog({
      action: 'channel.deleted',
      actorId: req.user!.userId,
      targetType: 'channel',
      targetId: id,
      targetName: channel.name,
    });

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    logError('Admin delete channel error', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// POST /admin/channels/:id/archive - Archive a channel (soft delete)
router.post('/channels/:id/archive', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }

    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    if (channel.archivedAt) {
      res.status(400).json({ error: 'Channel is already archived' });
      return;
    }

    const updated = await prisma.channel.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: { _count: { select: { members: true, messages: true } } },
    });

    const io = getIO();
    if (io) {
      io.emit('channel:archived', { channelId: id, name: channel.name });
    }

    writeAuditLog({
      action: 'channel.archived',
      actorId: req.user!.userId,
      targetType: 'channel',
      targetId: id,
      targetName: channel.name,
    });

    res.json(updated);
  } catch (error) {
    logError('Admin archive channel error', error);
    res.status(500).json({ error: 'Failed to archive channel' });
  }
});

// POST /admin/channels/:id/unarchive - Unarchive a channel
router.post('/channels/:id/unarchive', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }

    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    if (!channel.archivedAt) {
      res.status(400).json({ error: 'Channel is not archived' });
      return;
    }

    const updated = await prisma.channel.update({
      where: { id },
      data: { archivedAt: null },
      include: { _count: { select: { members: true, messages: true } } },
    });

    const io = getIO();
    if (io) {
      io.emit('channel:unarchived', { channelId: id, name: channel.name });
    }

    writeAuditLog({
      action: 'channel.unarchived',
      actorId: req.user!.userId,
      targetType: 'channel',
      targetId: id,
      targetName: channel.name,
    });

    res.json(updated);
  } catch (error) {
    logError('Admin unarchive channel error', error);
    res.status(500).json({ error: 'Failed to unarchive channel' });
  }
});

// PATCH /admin/channels/:id - Edit channel name
const editChannelSchema = z.object({
  name: z.string().min(1).max(80)
    .refine(val => val.trim().length > 0, { message: 'Name cannot be empty' })
    .refine(val => /^[a-z0-9-]+$/.test(val), { message: 'Channel name must be lowercase alphanumeric with hyphens' })
    .optional(),
  isPrivate: z.boolean().optional(),
}).refine(data => data.name !== undefined || data.isPrivate !== undefined, {
  message: 'At least one field must be provided',
});

router.patch('/channels/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid channel ID' });
      return;
    }

    const parsed = editChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      return;
    }

    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const updateData: { name?: string; isPrivate?: boolean } = {};
    const changes: string[] = [];

    if (parsed.data.name && parsed.data.name !== channel.name) {
      // Check for name conflicts
      const existing = await prisma.channel.findUnique({ where: { name: parsed.data.name } });
      if (existing) {
        res.status(400).json({ error: 'A channel with that name already exists' });
        return;
      }
      updateData.name = parsed.data.name;
      changes.push(`Renamed from #${channel.name} to #${parsed.data.name}`);
    }

    if (parsed.data.isPrivate !== undefined && parsed.data.isPrivate !== channel.isPrivate) {
      updateData.isPrivate = parsed.data.isPrivate;
      changes.push(`Changed to ${parsed.data.isPrivate ? 'private' : 'public'}`);
    }

    if (Object.keys(updateData).length === 0) {
      res.json(channel);
      return;
    }

    const updated = await prisma.channel.update({
      where: { id },
      data: updateData,
      include: { _count: { select: { members: true, messages: true } } },
    });

    writeAuditLog({
      action: 'channel.edited',
      actorId: req.user!.userId,
      targetType: 'channel',
      targetId: id,
      targetName: updated.name,
      details: changes.join('; '),
    });

    res.json(updated);
  } catch (error) {
    logError('Admin edit channel error', error);
    res.status(500).json({ error: 'Failed to edit channel' });
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

// GET /admin/audit-log - List audit log entries
router.get('/audit-log', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: {
          actor: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ entries, total });
  } catch (error) {
    logError('Admin audit log error', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// POST /admin/transfer-ownership - Transfer workspace ownership (OWNER only)
const transferOwnershipSchema = z.object({
  userId: z.number().int().positive(),
});

router.post('/transfer-ownership', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'OWNER') {
      res.status(403).json({ error: 'Only the workspace owner can transfer ownership' });
      return;
    }

    const { userId } = transferOwnershipSchema.parse(req.body);
    const ownerId = req.user!.userId;

    if (userId === ownerId) {
      res.status(400).json({ error: 'Cannot transfer ownership to yourself' });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, deactivatedAt: true },
    });

    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (target.deactivatedAt) {
      res.status(400).json({ error: 'Cannot transfer ownership to a deactivated user' });
      return;
    }

    // Atomic: demote current owner to ADMIN, promote target to OWNER
    await prisma.$transaction([
      prisma.user.update({ where: { id: ownerId }, data: { role: 'ADMIN' } }),
      prisma.user.update({ where: { id: userId }, data: { role: 'OWNER' } }),
    ]);

    writeAuditLog({
      action: 'workspace.ownership_transferred',
      actorId: ownerId,
      targetType: 'user',
      targetId: userId,
      targetName: target.name,
      details: `Workspace ownership transferred to ${target.name}`,
    });

    res.json({ message: 'Ownership transferred successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Admin transfer ownership error', error);
    res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

export default router;
