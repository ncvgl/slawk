import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { checkChannelMembership } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { parseIntParam } from '../utils/params.js';
import { logError } from '../utils/logger.js';

const router = Router();

const scheduleMessageSchema = z.object({
  content: z.string()
    .min(1)
    .max(4000)
    .refine(val => val.trim().length > 0, { message: 'Message content cannot be empty or whitespace only' })
    .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' }),
  channelId: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
});

// POST /messages/schedule — create a scheduled message
router.post('/schedule', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { content, channelId, scheduledAt } = scheduleMessageSchema.parse(req.body);

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      res.status(400).json({ error: 'scheduledAt must be in the future' });
      return;
    }

    // Enforce maximum scheduling horizon (30 days)
    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + 30);
    if (scheduledDate > maxFuture) {
      res.status(400).json({ error: 'Cannot schedule more than 30 days in advance' });
      return;
    }

    // Check channel membership and archival status
    const isMember = await checkChannelMembership(userId, channelId);
    if (!isMember) {
      res.status(403).json({ error: 'You must be a member of the channel' });
      return;
    }

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { archivedAt: true },
    });
    if (channel?.archivedAt) {
      res.status(403).json({ error: 'This channel has been archived' });
      return;
    }

    // Enforce per-user cap on unsent scheduled messages
    const pendingCount = await prisma.scheduledMessage.count({
      where: { userId, sent: false },
    });
    if (pendingCount >= 25) {
      res.status(400).json({ error: 'Maximum of 25 pending scheduled messages allowed' });
      return;
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        content,
        channelId,
        userId,
        scheduledAt: scheduledDate,
      },
      include: {
        channel: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(scheduled);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Schedule message error', error);
    res.status(500).json({ error: 'Failed to schedule message' });
  }
});

// GET /messages/scheduled — list user's scheduled (unsent) messages
router.get('/scheduled', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const messages = await prisma.scheduledMessage.findMany({
      where: { userId, sent: false },
      include: {
        channel: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json(messages);
  } catch (error) {
    logError('Get scheduled messages error', error);
    res.status(500).json({ error: 'Failed to get scheduled messages' });
  }
});

// DELETE /messages/scheduled/:id — cancel a scheduled message
router.delete('/scheduled/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const scheduled = await prisma.scheduledMessage.findUnique({
      where: { id },
    });

    if (!scheduled) {
      res.status(404).json({ error: 'Scheduled message not found' });
      return;
    }

    if (scheduled.userId !== userId) {
      res.status(403).json({ error: 'Not authorized to cancel this message' });
      return;
    }

    if (scheduled.sent) {
      res.status(400).json({ error: 'Message has already been sent' });
      return;
    }

    await prisma.scheduledMessage.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    logError('Cancel scheduled message error', error);
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
});

// PATCH /messages/scheduled/:id — edit a scheduled message
const editScheduleSchema = z.object({
  content: z.string().min(1).max(4000)
    .refine(val => val.trim().length > 0, { message: 'Message content cannot be empty' })
    .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' })
    .optional(),
  scheduledAt: z.string().datetime().optional(),
}).refine(data => data.content || data.scheduledAt, { message: 'At least one field must be provided' });

router.patch('/scheduled/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const parsed = editScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      return;
    }

    const scheduled = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!scheduled) {
      res.status(404).json({ error: 'Scheduled message not found' });
      return;
    }
    if (scheduled.userId !== userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    if (scheduled.sent) {
      res.status(400).json({ error: 'Message has already been sent' });
      return;
    }

    const updateData: { content?: string; scheduledAt?: Date } = {};
    if (parsed.data.content) updateData.content = parsed.data.content;
    if (parsed.data.scheduledAt) {
      const newDate = new Date(parsed.data.scheduledAt);
      if (newDate <= new Date()) {
        res.status(400).json({ error: 'scheduledAt must be in the future' });
        return;
      }
      updateData.scheduledAt = newDate;
    }

    const updated = await prisma.scheduledMessage.update({
      where: { id },
      data: updateData,
      include: { channel: { select: { id: true, name: true } } },
    });

    res.json(updated);
  } catch (error) {
    logError('Edit scheduled message error', error);
    res.status(500).json({ error: 'Failed to edit scheduled message' });
  }
});

// POST /messages/scheduled/:id/send — send a scheduled message immediately
router.post('/scheduled/:id/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseIntParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const scheduled = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!scheduled) {
      res.status(404).json({ error: 'Scheduled message not found' });
      return;
    }
    if (scheduled.userId !== userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    if (scheduled.sent) {
      res.status(400).json({ error: 'Message has already been sent' });
      return;
    }

    // Atomically verify authorization and send — membership and archival
    // are checked inside the transaction to close the TOCTOU gap.
    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.channelMember.findUnique({
        where: { userId_channelId: { userId, channelId: scheduled.channelId } },
      });
      if (!membership) return { error: 'You are no longer a member of the channel' } as const;

      const channel = await tx.channel.findUnique({
        where: { id: scheduled.channelId },
        select: { archivedAt: true },
      });
      if (channel?.archivedAt) return { error: 'This channel has been archived' } as const;

      await tx.scheduledMessage.update({
        where: { id },
        data: { sent: true },
      });
      const msg = await tx.message.create({
        data: {
          content: scheduled.content,
          userId: scheduled.userId,
          channelId: scheduled.channelId,
        },
        include: {
          user: { select: { id: true, name: true, avatar: true } },
          files: { select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true } },
        },
      });
      return { message: msg } as const;
    });

    if ('error' in result) {
      res.status(403).json({ error: result.error });
      return;
    }

    const { message } = result;

    // Broadcast via WebSocket
    const { getIO } = await import('../websocket/index.js');
    const io = getIO();
    if (io) {
      io.to(`channel:${scheduled.channelId}`).emit('message:new', message);
    }

    res.json({ success: true, message });
  } catch (error) {
    logError('Send scheduled message now error', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
