import { Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { AuthRequest } from '../types.js';

// ── Express Middleware ──────────────────────────────────────────────

/**
 * Requires the authenticated user to be a member of the channel
 * specified by req.params.id. Attaches req.channelId on success.
 */
export async function requireChannelMembership(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const channelId = parseInt(req.params.id);
  if (isNaN(channelId)) {
    res.status(400).json({ error: 'Invalid channel ID' });
    return;
  }

  const userId = req.user!.userId;
  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  if (!membership) {
    res.status(403).json({ error: 'You must be a member of this channel' });
    return;
  }

  req.channelId = channelId;
  next();
}

/**
 * Requires the authenticated user to have access to the message
 * specified by req.params.id (message must exist, not be deleted,
 * and the user must be a member of its channel).
 * Attaches req.message and req.channelId on success.
 */
export async function requireMessageAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const messageId = parseInt(req.params.id);
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

  const userId = req.user!.userId;
  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId: message.channelId } },
  });

  if (!membership) {
    res.status(403).json({ error: 'You must be a member of this channel' });
    return;
  }

  req.message = message;
  req.channelId = message.channelId;
  next();
}

/**
 * Requires the authenticated user to have access to the file
 * specified by req.params.id. If the file is attached to a message,
 * checks channel membership. If unattached, only the file owner
 * can access it. Attaches req.file on success.
 */
export async function requireFileAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const fileId = parseInt(req.params.id);
  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const userId = req.user!.userId;

  if (file.messageId) {
    // File is attached to a message — check channel membership
    const message = await prisma.message.findUnique({
      where: { id: file.messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const membership = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId: message.channelId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'You must be a member of this channel' });
      return;
    }
  } else {
    // Unattached file — only the owner can access it
    if (file.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  req.file = file;
  next();
}

// ── WebSocket Helper ────────────────────────────────────────────────

export async function checkChannelMembership(
  userId: number,
  channelId: number,
): Promise<boolean> {
  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  return !!membership;
}

// ── Zod Schemas for WebSocket Payloads ──────────────────────────────

export const wsMessageSendSchema = z.object({
  channelId: z.number().int().positive(),
  content: z.string().min(1).max(4000),
  threadId: z.number().int().positive().optional(),
  fileIds: z.array(z.number().int().positive()).optional(),
});

export const wsMessageEditSchema = z.object({
  messageId: z.number().int().positive(),
  content: z.string().min(1).max(4000),
});

export const wsMessageDeleteSchema = z.object({
  messageId: z.number().int().positive(),
});

export const wsDmSendSchema = z.object({
  toUserId: z.number().int().positive(),
  content: z.string().min(1).max(4000),
});

export const wsChannelIdSchema = z.number().int().positive();

export const wsUserIdSchema = z.number().int().positive();
