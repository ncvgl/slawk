import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

const router = Router();

const createChannelSchema = z.object({
  name: z.string()
    .min(1)
    .max(80)
    .refine(
      (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
      { message: 'Channel name cannot contain path traversal characters' }
    ),
  isPrivate: z.boolean().optional().default(false),
});

// POST /channels - Create channel
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, isPrivate } = createChannelSchema.parse(req.body);
    const userId = req.user!.userId;

    // Check for duplicate channel name
    const existingChannel = await prisma.channel.findFirst({
      where: { name },
    });

    if (existingChannel) {
      res.status(400).json({ error: 'Channel name already exists' });
      return;
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        isPrivate,
        members: {
          create: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    res.status(201).json(channel);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// GET /channels - List all channels
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      where: {
        OR: [
          { isPrivate: false },
          { members: { some: { userId: req.user!.userId } } },
        ],
      },
      include: {
        _count: {
          select: { members: true, messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(channels);
  } catch (error) {
    console.error('List channels error:', error);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

// GET /channels/:id - Get single channel
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    const userId = req.user!.userId;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // Check access for private channels
    if (channel.isPrivate) {
      const isMember = channel.members.some(m => m.userId === userId);
      if (!isMember) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    res.json(channel);
  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

// POST /channels/:id/join - Join a channel
router.post('/:id/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    const userId = req.user!.userId;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // Prevent joining private channels without invite
    if (channel.isPrivate) {
      res.status(403).json({ error: 'Cannot join private channel without invite' });
      return;
    }

    const existingMembership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId },
      },
    });

    if (existingMembership) {
      res.status(400).json({ error: 'Already a member of this channel' });
      return;
    }

    await prisma.channelMember.create({
      data: { userId, channelId },
    });

    res.json({ message: 'Joined channel successfully' });
  } catch (error) {
    console.error('Join channel error:', error);
    res.status(500).json({ error: 'Failed to join channel' });
  }
});

// POST /channels/:id/leave - Leave a channel
router.post('/:id/leave', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);
    const userId = req.user!.userId;

    // Check if user is the last member
    const memberCount = await prisma.channelMember.count({
      where: { channelId },
    });

    if (memberCount <= 1) {
      res.status(400).json({ error: 'Cannot leave channel as the last member' });
      return;
    }

    await prisma.channelMember.delete({
      where: {
        userId_channelId: { userId, channelId },
      },
    });

    res.json({ message: 'Left channel successfully' });
  } catch (error) {
    console.error('Leave channel error:', error);
    res.status(500).json({ error: 'Failed to leave channel' });
  }
});

// GET /channels/:id/members - List channel members
router.get('/:id/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = parseInt(req.params.id);

    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: {
          select: { id: true, name: true, email: true, createdAt: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    res.json(members);
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

export default router;
