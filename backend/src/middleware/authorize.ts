import { Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { AuthRequest } from '../types.js';
import { parseIntParam } from '../utils/params.js';

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
  const channelId = parseIntParam(req.params.id);
  if (!channelId) {
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
  const messageId = parseIntParam(req.params.id);
  if (!messageId) {
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
  const fileId = parseIntParam(req.params.id);
  if (!fileId) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const userId = req.user!.userId;

  if (file.messageId) {
    // File is attached to a message — check channel membership and soft-delete
    const message = await prisma.message.findUnique({
      where: { id: file.messageId, deletedAt: null },
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

/**
 * Requires the authenticated user to be a participant in the DM
 * specified by req.params.id (either sender or recipient).
 * Use for read-only operations and thread replies.
 * Attaches req.dm on success.
 */
export async function requireDmAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const dmId = parseIntParam(req.params.id);
  if (!dmId) {
    res.status(400).json({ error: 'Invalid message ID' });
    return;
  }

  const dm = await prisma.directMessage.findUnique({
    where: { id: dmId },
  });

  if (!dm || dm.deletedAt !== null) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  const userId = req.user!.userId;
  if (dm.fromUserId !== userId && dm.toUserId !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  req.dm = dm;
  next();
}

/**
 * Requires the authenticated user to own the direct message
 * specified by req.params.id. Checks existence, soft-delete,
 * and fromUserId ownership. Attaches req.dm on success.
 */
export async function requireDmOwnership(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const dmId = parseIntParam(req.params.id);
  if (!dmId) {
    res.status(400).json({ error: 'Invalid message ID' });
    return;
  }

  const dm = await prisma.directMessage.findUnique({
    where: { id: dmId },
  });

  if (!dm || dm.deletedAt !== null) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  const userId = req.user!.userId;
  if (dm.fromUserId !== userId) {
    res.status(403).json({ error: 'You can only modify your own messages' });
    return;
  }

  req.dm = dm;
  next();
}

/**
 * Allows non-members to read public channels.
 * Members always pass; non-members pass only if the channel is public.
 * Attaches req.channelId and req.isChannelMember.
 */
export async function requirePublicChannelReadAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const channelId = parseIntParam(req.params.id);
  if (!channelId) {
    res.status(400).json({ error: 'Invalid channel ID' });
    return;
  }

  const userId = req.user!.userId;
  const [membership, channel] = await Promise.all([
    prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId } },
    }),
    prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, isPrivate: true },
    }),
  ]);

  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  if (!membership && channel.isPrivate) {
    res.status(403).json({ error: 'You must be a member of this channel' });
    return;
  }

  req.channelId = channelId;
  req.isChannelMember = !!membership;
  next();
}

/**
 * Allows non-members to read messages in public channels.
 * Attaches req.message and req.channelId.
 */
export async function requirePublicMessageReadAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const messageId = parseIntParam(req.params.id);
  if (!messageId) {
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
  const [membership, channel] = await Promise.all([
    prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId: message.channelId } },
    }),
    prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { id: true, isPrivate: true },
    }),
  ]);

  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  if (!membership && channel.isPrivate) {
    res.status(403).json({ error: 'You must be a member of this channel' });
    return;
  }

  req.message = message;
  req.channelId = message.channelId;
  req.isChannelMember = !!membership;
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

const contentSchema = z.string().min(1).max(4000)
  .refine(val => val.trim().length > 0, { message: 'Content cannot be empty' })
  .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' });

const optionalContentSchema = z.string().max(4000)
  .refine(val => !val.includes('\u0000'), { message: 'Content cannot contain null bytes' });

export const wsMessageSendSchema = z.object({
  channelId: z.number().int().positive(),
  content: optionalContentSchema,
  threadId: z.number().int().positive().optional(),
  fileIds: z.array(z.number().int().positive()).max(10).optional(),
}).refine(
  (data) => (data.content?.trim().length ?? 0) > 0 || (data.fileIds && data.fileIds.length > 0),
  { message: 'Message must have content or file attachments' },
);

export const wsMessageEditSchema = z.object({
  messageId: z.number().int().positive(),
  content: contentSchema,
});

export const wsMessageDeleteSchema = z.object({
  messageId: z.number().int().positive(),
});

export const wsDmSendSchema = z.object({
  toUserId: z.number().int().positive(),
  content: contentSchema,
});

export const wsChannelIdSchema = z.number().int().positive();

export const wsUserIdSchema = z.number().int().positive();

// ── Huddle Schemas ───────────────────────────────────────────────────

// channelId can be negative for DM huddles (-otherUserId)
const huddleChannelId = z.number().int().refine((n) => n !== 0, { message: 'channelId must not be zero' });

export const wsHuddleJoinSchema = z.object({
  channelId: huddleChannelId,
});

export const wsHuddleLeaveSchema = z.object({
  channelId: huddleChannelId,
});

export const wsHuddleMuteSchema = z.object({
  channelId: huddleChannelId,
  isMuted: z.boolean(),
});

export const wsHuddleSignalSchema = z.object({
  channelId: huddleChannelId,
  toUserId: z.number().int().positive(),
  signal: z.object({
    type: z.enum(['offer', 'answer', 'ice-candidate']),
    sdp: z.string().optional(),
    candidate: z.unknown().optional(),
  }),
});
