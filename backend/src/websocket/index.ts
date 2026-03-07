import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { JwtPayload } from '../types.js';
import { JWT_SECRET } from '../config.js';
import {
  checkChannelMembership,
  wsMessageSendSchema,
  wsMessageEditSchema,
  wsMessageDeleteSchema,
  wsDmSendSchema,
  wsChannelIdSchema,
  wsUserIdSchema,
} from '../middleware/authorize.js';
import { USER_SELECT_BASIC, MESSAGE_INCLUDE_WITH_FILES, DM_INCLUDE_USERS } from '../db/selects.js';
import { logError } from '../utils/logger.js';

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

// Track online users: Map<userId, Set<socketId>>
const onlineUsers = new Map<number, Set<string>>();

// Per-user rate limiting (keyed on userId, not socketId, to prevent bypass via reconnect)
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  'message:send': { max: 30, windowMs: 60_000 },
  'dm:send': { max: 30, windowMs: 60_000 },
  'message:edit': { max: 20, windowMs: 60_000 },
  'message:delete': { max: 20, windowMs: 60_000 },
  'typing:start': { max: 60, windowMs: 60_000 },
  'typing:stop': { max: 60, windowMs: 60_000 },
  'dm:typing:start': { max: 60, windowMs: 60_000 },
  'dm:typing:stop': { max: 60, windowMs: 60_000 },
  'join:channel': { max: 20, windowMs: 60_000 },
  'dm:join': { max: 20, windowMs: 60_000 },
};

const rateLimitState = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: number, event: string): boolean {
  const config = RATE_LIMITS[event];
  if (!config) return true;

  const key = `${userId}:${event}`;
  const now = Date.now();
  const entry = rateLimitState.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitState.set(key, { count: 1, resetAt: now + config.windowMs });
    return true;
  }

  if (entry.count >= config.max) return false;
  entry.count++;
  return true;
}

// Periodic cleanup of expired rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitState) {
    if (now >= entry.resetAt) rateLimitState.delete(key);
  }
}, 5 * 60 * 1000).unref();

// Get users who share channels or DMs with the given user (single query)
async function getSharedUsers(userId: number): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ userId: number }>>`
    SELECT DISTINCT "userId" FROM (
      SELECT cm2."userId"
      FROM "ChannelMember" cm1
      JOIN "ChannelMember" cm2 ON cm2."channelId" = cm1."channelId" AND cm2."userId" != cm1."userId"
      WHERE cm1."userId" = ${userId}
      UNION
      SELECT CASE WHEN "fromUserId" = ${userId} THEN "toUserId" ELSE "fromUserId" END AS "userId"
      FROM "DirectMessage"
      WHERE ("fromUserId" = ${userId} OR "toUserId" = ${userId})
        AND "deletedAt" IS NULL
    ) shared
  `;
  return rows.map((r) => r.userId);
}

export function initializeWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173'),
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 16384,
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Store module-level reference so REST routes can broadcast events
  ioInstance = io;

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload & { purpose?: string };
      // Reject scoped tokens (e.g. file-download) from being used as WS auth
      if (decoded.purpose) {
        return next(new Error('Invalid token'));
      }
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  // Periodic token revalidation: disconnect sockets whose JWT has expired or been revoked
  const TOKEN_REVALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
  setInterval(async () => {
    // Batch-fetch tokenVersions for all connected users
    const connectedUserIds = [...new Set(
      [...io.sockets.sockets.values()]
        .map(s => (s as AuthenticatedSocket).user?.userId)
        .filter((id): id is number => id !== undefined)
    )];
    const users = connectedUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: connectedUserIds } },
          select: { id: true, tokenVersion: true },
        })
      : [];
    const versionMap = new Map(users.map(u => [u.id, u.tokenVersion]));

    for (const [, socket] of io.sockets.sockets) {
      const authSocket = socket as AuthenticatedSocket;
      const token = authSocket.handshake?.auth?.token;
      if (!token) continue;
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload & { tokenVersion?: number };
        // Check tokenVersion if present in JWT
        if (decoded.tokenVersion !== undefined && decoded.userId) {
          const currentVersion = versionMap.get(decoded.userId);
          if (currentVersion !== undefined && currentVersion !== decoded.tokenVersion) {
            authSocket.emit('error', { message: 'Session revoked' });
            authSocket.disconnect(true);
          }
        }
      } catch {
        authSocket.emit('error', { message: 'Session expired' });
        authSocket.disconnect(true);
      }
    }
  }, TOKEN_REVALIDATION_INTERVAL).unref();

  io.on('connection', async (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.user?.userId} connected`);

    // Per-socket cache for channel membership (only cache positive results)
    const membershipCache = new Map<number, { result: boolean; expires: number }>();
    const MEMBERSHIP_CACHE_TTL = 30_000; // 30 seconds

    async function cachedCheckMembership(userId: number, channelId: number): Promise<boolean> {
      const cached = membershipCache.get(channelId);
      if (cached && Date.now() < cached.expires) return cached.result;
      const result = await checkChannelMembership(userId, channelId);
      // Only cache positive (truthy) results to avoid unbounded growth from negative lookups
      if (result) {
        membershipCache.set(channelId, { result, expires: Date.now() + MEMBERSHIP_CACHE_TTL });
      }
      return result;
    }

    // Track user presence
    if (socket.user) {
      const userId = socket.user.userId;

      // Add socket to user's connections
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId)!.add(socket.id);

      // If this is the first connection, mark user online and broadcast
      if (onlineUsers.get(userId)!.size === 1) {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { status: 'online' },
          });

          // Broadcast presence to shared users
          const sharedUsers = await getSharedUsers(userId);
          for (const sharedUserId of sharedUsers) {
            io.to(`user:${sharedUserId}`).emit('presence:update', {
              userId,
              status: 'online',
            });
          }
        } catch (err) {
          logError('Failed to update user presence', err);
        }
      }
    }

    // Join channel room
    socket.on('join:channel', async (rawChannelId: unknown, ack?: (ok: boolean) => void) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'join:channel')) {
        if (typeof ack === 'function') ack(false);
        return;
      }

      const parsed = wsChannelIdSchema.safeParse(rawChannelId);
      if (!parsed.success) {
        socket.emit('error', { message: 'Invalid channel ID' });
        if (typeof ack === 'function') ack(false);
        return;
      }
      const channelId = parsed.data;

      const isMember = await checkChannelMembership(socket.user.userId, channelId);
      if (!isMember) {
        socket.emit('error', { message: 'You must join the channel first' });
        if (typeof ack === 'function') ack(false);
        return;
      }

      socket.join(`channel:${channelId}`);
      console.log(`User ${socket.user.userId} joined channel ${channelId}`);
      if (typeof ack === 'function') ack(true);
    });

    // Leave channel room
    socket.on('leave:channel', (rawChannelId: unknown) => {
      const parsed = wsChannelIdSchema.safeParse(rawChannelId);
      if (!parsed.success) return;
      socket.leave(`channel:${parsed.data}`);
      console.log(`User ${socket.user?.userId} left channel ${parsed.data}`);
    });

    // Send message
    socket.on('message:send', async (rawData: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'message:send')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      try {
        const parsed = wsMessageSendSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit('error', { message: 'Invalid message payload' });
          return;
        }
        const data = parsed.data;

        // Verify user is a member of the channel
        const isMember = await checkChannelMembership(socket.user.userId, data.channelId);
        if (!isMember) {
          socket.emit('error', { message: 'You must join the channel to send messages' });
          return;
        }

        // Validate threadId belongs to the same channel
        if (data.threadId) {
          const parentMessage = await prisma.message.findUnique({
            where: { id: data.threadId },
          });
          if (!parentMessage || parentMessage.channelId !== data.channelId) {
            socket.emit('error', { message: 'Thread parent must belong to the same channel' });
            return;
          }
        }

        // Create message and atomically attach files in a transaction
        const finalMessage = await prisma.$transaction(async (tx) => {
          const msg = await tx.message.create({
            data: {
              content: data.content,
              userId: socket.user!.userId,
              channelId: data.channelId,
              threadId: data.threadId,
            },
          });

          // Attach files atomically — validates ownership and unattached status
          if (data.fileIds && data.fileIds.length > 0) {
            const updated = await tx.file.updateMany({
              where: { id: { in: data.fileIds }, userId: socket.user!.userId, messageId: null },
              data: { messageId: msg.id },
            });
            if (updated.count !== data.fileIds.length) {
              throw new Error('Invalid file IDs or files already attached');
            }
          }

          return tx.message.findUnique({
            where: { id: msg.id },
            include: MESSAGE_INCLUDE_WITH_FILES,
          });
        });

        // Always emit to the sender so they see their own message immediately,
        // even if their socket hasn't joined the channel room yet.
        socket.emit('message:new', finalMessage);
        // Broadcast to all OTHER users in the channel room
        socket.to(`channel:${data.channelId}`).emit('message:new', finalMessage);
      } catch (error) {
        logError('WebSocket message error', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Edit message
    socket.on('message:edit', async (rawData: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'message:edit')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      try {
        const parsed = wsMessageEditSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit('error', { message: 'Invalid edit payload' });
          return;
        }
        const data = parsed.data;

        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
        });

        if (!message || message.deletedAt) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        const isMember = await checkChannelMembership(socket.user.userId, message.channelId);
        if (!isMember) {
          socket.emit('error', { message: 'You must be a member of this channel' });
          return;
        }

        if (message.userId !== socket.user.userId) {
          socket.emit('error', { message: 'You can only edit your own messages' });
          return;
        }

        const updatedMessage = await prisma.message.update({
          where: { id: data.messageId },
          data: { content: data.content, editedAt: new Date() },
          include: { user: { select: USER_SELECT_BASIC } },
        });

        io.to(`channel:${message.channelId}`).emit('message:updated', updatedMessage);
      } catch (error) {
        logError('WebSocket edit message error', error);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Delete message
    socket.on('message:delete', async (rawData: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'message:delete')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      try {
        const parsed = wsMessageDeleteSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit('error', { message: 'Invalid delete payload' });
          return;
        }
        const data = parsed.data;

        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
        });

        if (!message || message.deletedAt) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        const isMember = await checkChannelMembership(socket.user.userId, message.channelId);
        if (!isMember) {
          socket.emit('error', { message: 'You must be a member of this channel' });
          return;
        }

        if (message.userId !== socket.user.userId) {
          socket.emit('error', { message: 'You can only delete your own messages' });
          return;
        }

        await prisma.message.update({
          where: { id: data.messageId },
          data: { deletedAt: new Date() },
        });

        io.to(`channel:${message.channelId}`).emit('message:deleted', { messageId: data.messageId });
      } catch (error) {
        logError('WebSocket delete message error', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Typing indicator (uses cached membership to avoid DB query per keystroke)
    socket.on('typing:start', async (rawChannelId: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'typing:start')) return;

      const parsed = wsChannelIdSchema.safeParse(rawChannelId);
      if (!parsed.success) return;
      const channelId = parsed.data;

      const isMember = await cachedCheckMembership(socket.user.userId, channelId);
      if (!isMember) return;

      socket.to(`channel:${channelId}`).emit('typing:start', {
        userId: socket.user.userId,
      });
    });

    socket.on('typing:stop', async (rawChannelId: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'typing:stop')) return;

      const parsed = wsChannelIdSchema.safeParse(rawChannelId);
      if (!parsed.success) return;
      const channelId = parsed.data;

      const isMember = await cachedCheckMembership(socket.user.userId, channelId);
      if (!isMember) return;

      socket.to(`channel:${channelId}`).emit('typing:stop', {
        userId: socket.user.userId,
      });
    });

    // Join user's personal room for DMs
    if (socket.user) {
      socket.join(`user:${socket.user.userId}`);
    }

    // Join DM conversation room
    socket.on('dm:join', async (rawOtherUserId: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'dm:join')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      const parsed = wsUserIdSchema.safeParse(rawOtherUserId);
      if (!parsed.success) {
        socket.emit('error', { message: 'Invalid user ID' });
        return;
      }
      const otherUserId = parsed.data;

      // Verify both users have exchanged DMs before allowing room join
      const hasDmHistory = await prisma.directMessage.findFirst({
        where: {
          OR: [
            { fromUserId: socket.user.userId, toUserId: otherUserId },
            { fromUserId: otherUserId, toUserId: socket.user.userId },
          ],
        },
      });

      if (!hasDmHistory) {
        // Allow joining if the other user exists (first DM scenario)
        const otherUser = await prisma.user.findUnique({ where: { id: otherUserId } });
        if (!otherUser) {
          socket.emit('error', { message: 'User not found' });
          return;
        }
      }

      // Create a consistent room name regardless of who initiates
      const roomId = [socket.user.userId, otherUserId].sort().join('-');
      socket.join(`dm:${roomId}`);
      console.log(`User ${socket.user.userId} joined DM room ${roomId}`);
    });

    // Leave DM conversation room
    socket.on('dm:leave', (rawOtherUserId: unknown) => {
      if (!socket.user) return;

      const parsed = wsUserIdSchema.safeParse(rawOtherUserId);
      if (!parsed.success) return;
      const otherUserId = parsed.data;

      const roomId = [socket.user.userId, otherUserId].sort().join('-');
      socket.leave(`dm:${roomId}`);
      console.log(`User ${socket.user?.userId} left DM room ${roomId}`);
    });

    // Send DM via WebSocket
    socket.on('dm:send', async (rawData: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'dm:send')) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      try {
        const parsed = wsDmSendSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit('error', { message: 'Invalid DM payload' });
          return;
        }
        const data = parsed.data;

        const isSelfDM = socket.user.userId === data.toUserId;

        // Check if recipient exists (self-DM is allowed)
        if (!isSelfDM) {
          const recipient = await prisma.user.findUnique({
            where: { id: data.toUserId },
          });

          if (!recipient) {
            socket.emit('error', { message: 'Unable to send message' });
            return;
          }
        }

        const dm = await prisma.directMessage.create({
          data: {
            content: data.content,
            fromUserId: socket.user.userId,
            toUserId: data.toUserId,
            // Self-DMs are auto-read (no notifications)
            ...(isSelfDM && { readAt: new Date() }),
          },
          include: DM_INCLUDE_USERS,
        });

        // Emit to both users' personal rooms (avoid duplicate for self-DM)
        io.to(`user:${socket.user.userId}`).emit('dm:new', dm);
        if (!isSelfDM) {
          io.to(`user:${data.toUserId}`).emit('dm:new', dm);
        }
      } catch (error) {
        logError('WebSocket DM error', error);
        socket.emit('error', { message: 'Failed to send DM' });
      }
    });

    // DM typing indicator — verify DM conversation exists before emitting
    socket.on('dm:typing:start', async (rawToUserId: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'dm:typing:start')) return;

      const parsed = wsUserIdSchema.safeParse(rawToUserId);
      if (!parsed.success) return;
      const toUserId = parsed.data;

      // Verify DM conversation exists between users
      const hasDm = await prisma.directMessage.findFirst({
        where: {
          OR: [
            { fromUserId: socket.user.userId, toUserId },
            { fromUserId: toUserId, toUserId: socket.user.userId },
          ],
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!hasDm) return;

      io.to(`user:${toUserId}`).emit('dm:typing:start', {
        userId: socket.user.userId,
      });
    });

    socket.on('dm:typing:stop', async (rawToUserId: unknown) => {
      if (!socket.user) return;
      if (!checkRateLimit(socket.user.userId, 'dm:typing:stop')) return;

      const parsed = wsUserIdSchema.safeParse(rawToUserId);
      if (!parsed.success) return;
      const toUserId = parsed.data;

      // Verify DM conversation exists between users
      const hasDm = await prisma.directMessage.findFirst({
        where: {
          OR: [
            { fromUserId: socket.user.userId, toUserId },
            { fromUserId: toUserId, toUserId: socket.user.userId },
          ],
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!hasDm) return;

      io.to(`user:${toUserId}`).emit('dm:typing:stop', {
        userId: socket.user.userId,
      });
    });

    socket.on('disconnect', async () => {
      console.log(`User ${socket.user?.userId} disconnected`);

      if (socket.user) {
        const userId = socket.user.userId;

        // Remove socket from user's connections (always, before any async work)
        const userSockets = onlineUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);

          // If no more connections, mark user offline
          if (userSockets.size === 0) {
            onlineUsers.delete(userId);

            try {
              await prisma.user.update({
                where: { id: userId },
                data: {
                  status: 'offline',
                  lastSeen: new Date(),
                },
              });

              // Broadcast presence to shared users
              const sharedUsers = await getSharedUsers(userId);
              for (const sharedUserId of sharedUsers) {
                io.to(`user:${sharedUserId}`).emit('presence:update', {
                  userId,
                  status: 'offline',
                  lastSeen: new Date(),
                });
              }
            } catch (err) {
              logError('Failed to update user presence on disconnect', err);
            }
          }
        }
      }
    });
  });

  return io;
}

// Module-level io reference so REST routes can emit events
let ioInstance: Server | null = null;

export function getIO(): Server | null {
  return ioInstance;
}

// Export for use in REST endpoints
export function isUserOnline(userId: number): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

// Forcibly disconnect all sockets for a user (used by admin deactivation)
export function kickUser(userId: number): void {
  const io = getIO();
  if (!io) return;
  const userSockets = onlineUsers.get(userId);
  if (!userSockets) return;
  for (const socketId of userSockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('error', { message: 'Account deactivated' });
      socket.disconnect(true);
    }
  }
}

