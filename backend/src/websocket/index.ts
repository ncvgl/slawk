import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { JwtPayload } from '../types.js';
import {
  checkChannelMembership,
  wsMessageSendSchema,
  wsMessageEditSchema,
  wsMessageDeleteSchema,
  wsDmSendSchema,
  wsChannelIdSchema,
  wsUserIdSchema,
} from '../middleware/authorize.js';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET is required in production'); })() : 'your-secret-key');

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

// Track online users: Map<userId, Set<socketId>>
const onlineUsers = new Map<number, Set<string>>();

// Get users who share channels or DMs with the given user
async function getSharedUsers(userId: number): Promise<number[]> {
  // Get channel members from user's channels
  const userChannels = await prisma.channelMember.findMany({
    where: { userId },
    select: { channelId: true },
  });
  const channelIds = userChannels.map((c) => c.channelId);

  const channelMembers = await prisma.channelMember.findMany({
    where: {
      channelId: { in: channelIds },
      userId: { not: userId },
    },
    select: { userId: true },
  });

  // Get DM participants
  const dmUsers = await prisma.directMessage.findMany({
    where: {
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
    select: { fromUserId: true, toUserId: true },
    distinct: ['fromUserId', 'toUserId'],
  });

  const dmUserIds = dmUsers.flatMap((dm) =>
    [dm.fromUserId, dm.toUserId].filter((id) => id !== userId)
  );

  // Combine and dedupe
  const allUserIds = new Set([
    ...channelMembers.map((m) => m.userId),
    ...dmUserIds,
  ]);

  return Array.from(allUserIds);
}

export function initializeWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*'),
      methods: ['GET', 'POST'],
    },
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
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.user?.email} connected`);

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
          console.error('Failed to update user presence:', err);
        }
      }
    }

    // Join channel room
    socket.on('join:channel', async (rawChannelId: unknown) => {
      if (!socket.user) return;

      const parsed = wsChannelIdSchema.safeParse(rawChannelId);
      if (!parsed.success) {
        socket.emit('error', { message: 'Invalid channel ID' });
        return;
      }
      const channelId = parsed.data;

      const isMember = await checkChannelMembership(socket.user.userId, channelId);
      if (!isMember) {
        socket.emit('error', { message: 'You must join the channel first' });
        return;
      }

      socket.join(`channel:${channelId}`);
      console.log(`User ${socket.user.email} joined channel ${channelId}`);
    });

    // Leave channel room
    socket.on('leave:channel', (channelId: number) => {
      socket.leave(`channel:${channelId}`);
      console.log(`User ${socket.user?.email} left channel ${channelId}`);
    });

    // Send message
    socket.on('message:send', async (rawData: unknown) => {
      if (!socket.user) return;

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

        // Validate fileIds if provided
        if (data.fileIds && data.fileIds.length > 0) {
          const files = await prisma.file.findMany({
            where: {
              id: { in: data.fileIds },
              userId: socket.user.userId,
              messageId: null,
            },
          });

          if (files.length !== data.fileIds.length) {
            socket.emit('error', { message: 'Invalid file IDs or files already attached' });
            return;
          }
        }

        const message = await prisma.message.create({
          data: {
            content: data.content,
            userId: socket.user.userId,
            channelId: data.channelId,
            threadId: data.threadId,
          },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            files: {
              select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true },
            },
          },
        });

        // Attach files to the message
        if (data.fileIds && data.fileIds.length > 0) {
          await prisma.file.updateMany({
            where: { id: { in: data.fileIds }, userId: socket.user.userId },
            data: { messageId: message.id },
          });
        }

        // Fetch final message with files
        const finalMessage = await prisma.message.findUnique({
          where: { id: message.id },
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true },
            },
            files: {
              select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true },
            },
          },
        });

        // Always emit to the sender so they see their own message immediately,
        // even if their socket hasn't joined the channel room yet.
        socket.emit('message:new', finalMessage);
        // Broadcast to all OTHER users in the channel room
        socket.to(`channel:${data.channelId}`).emit('message:new', finalMessage);
      } catch (error) {
        console.error('WebSocket message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Edit message
    socket.on('message:edit', async (rawData: unknown) => {
      if (!socket.user) return;

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
          data: { content: data.content },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        io.to(`channel:${message.channelId}`).emit('message:updated', updatedMessage);
      } catch (error) {
        console.error('WebSocket edit message error:', error);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Delete message
    socket.on('message:delete', async (rawData: unknown) => {
      if (!socket.user) return;

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
        console.error('WebSocket delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Typing indicator
    socket.on('typing:start', async (rawChannelId: unknown) => {
      if (!socket.user) return;
      const parsed = wsChannelIdSchema.safeParse(rawChannelId);
      if (!parsed.success) return;
      const channelId = parsed.data;

      const isMember = await checkChannelMembership(socket.user.userId, channelId);
      if (!isMember) return;

      socket.to(`channel:${channelId}`).emit('typing:start', {
        userId: socket.user.userId,
        email: socket.user.email,
      });
    });

    socket.on('typing:stop', async (rawChannelId: unknown) => {
      if (!socket.user) return;
      const parsed = wsChannelIdSchema.safeParse(rawChannelId);
      if (!parsed.success) return;
      const channelId = parsed.data;

      const isMember = await checkChannelMembership(socket.user.userId, channelId);
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
      console.log(`User ${socket.user.email} joined DM room ${roomId}`);
    });

    // Leave DM conversation room
    socket.on('dm:leave', (otherUserId: number) => {
      if (!socket.user) return;

      const roomId = [socket.user.userId, otherUserId].sort().join('-');
      socket.leave(`dm:${roomId}`);
      console.log(`User ${socket.user?.email} left DM room ${roomId}`);
    });

    // Send DM via WebSocket
    socket.on('dm:send', async (rawData: unknown) => {
      if (!socket.user) return;

      try {
        const parsed = wsDmSendSchema.safeParse(rawData);
        if (!parsed.success) {
          socket.emit('error', { message: 'Invalid DM payload' });
          return;
        }
        const data = parsed.data;

        if (socket.user.userId === data.toUserId) {
          socket.emit('error', { message: 'Cannot send DM to yourself' });
          return;
        }

        // Check if recipient exists
        const recipient = await prisma.user.findUnique({
          where: { id: data.toUserId },
        });

        if (!recipient) {
          socket.emit('error', { message: 'Recipient not found' });
          return;
        }

        const dm = await prisma.directMessage.create({
          data: {
            content: data.content,
            fromUserId: socket.user.userId,
            toUserId: data.toUserId,
          },
          include: {
            fromUser: {
              select: { id: true, name: true, email: true, avatar: true },
            },
            toUser: {
              select: { id: true, name: true, email: true, avatar: true },
            },
          },
        });

        // Emit to both users' personal rooms
        io.to(`user:${socket.user.userId}`).emit('dm:new', dm);
        io.to(`user:${data.toUserId}`).emit('dm:new', dm);

        // Also emit to the DM conversation room
        const roomId = [socket.user.userId, data.toUserId].sort().join('-');
        io.to(`dm:${roomId}`).emit('dm:new', dm);
      } catch (error) {
        console.error('WebSocket DM error:', error);
        socket.emit('error', { message: 'Failed to send DM' });
      }
    });

    // DM typing indicator
    socket.on('dm:typing:start', (rawToUserId: unknown) => {
      if (!socket.user) return;
      const parsed = wsUserIdSchema.safeParse(rawToUserId);
      if (!parsed.success) return;
      const toUserId = parsed.data;

      io.to(`user:${toUserId}`).emit('dm:typing:start', {
        userId: socket.user.userId,
        email: socket.user.email,
      });
    });

    socket.on('dm:typing:stop', (rawToUserId: unknown) => {
      if (!socket.user) return;
      const parsed = wsUserIdSchema.safeParse(rawToUserId);
      if (!parsed.success) return;
      const toUserId = parsed.data;

      io.to(`user:${toUserId}`).emit('dm:typing:stop', {
        userId: socket.user.userId,
      });
    });

    socket.on('disconnect', async () => {
      console.log(`User ${socket.user?.email} disconnected`);

      if (socket.user) {
        const userId = socket.user.userId;

        // Remove socket from user's connections
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
              console.error('Failed to update user presence on disconnect:', err);
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

export function getOnlineUserIds(): number[] {
  return Array.from(onlineUsers.keys());
}
