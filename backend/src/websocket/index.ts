import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { JwtPayload } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

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
    socket.on('join:channel', async (channelId: number) => {
      if (!socket.user) return;

      // Verify user is a member of the channel
      const membership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: { userId: socket.user.userId, channelId },
        },
      });

      if (!membership) {
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
    socket.on('message:send', async (data: { channelId: number; content: string; threadId?: number; fileIds?: number[] }) => {
      if (!socket.user) return;

      try {
        // Verify user is a member of the channel
        const membership = await prisma.channelMember.findUnique({
          where: {
            userId_channelId: { userId: socket.user.userId, channelId: data.channelId },
          },
        });

        if (!membership) {
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
              select: { id: true, name: true, email: true },
            },
            files: {
              select: { id: true, filename: true, originalName: true, mimetype: true, size: true, url: true },
            },
          },
        });

        // Broadcast to all users in the channel
        io.to(`channel:${data.channelId}`).emit('message:new', finalMessage);
      } catch (error) {
        console.error('WebSocket message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Edit message
    socket.on('message:edit', async (data: { messageId: number; content: string }) => {
      if (!socket.user) return;

      try {
        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
        });

        if (!message || message.deletedAt) {
          socket.emit('error', { message: 'Message not found' });
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
    socket.on('message:delete', async (data: { messageId: number }) => {
      if (!socket.user) return;

      try {
        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
        });

        if (!message || message.deletedAt) {
          socket.emit('error', { message: 'Message not found' });
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
    socket.on('typing:start', (channelId: number) => {
      socket.to(`channel:${channelId}`).emit('typing:start', {
        userId: socket.user?.userId,
        email: socket.user?.email,
      });
    });

    socket.on('typing:stop', (channelId: number) => {
      socket.to(`channel:${channelId}`).emit('typing:stop', {
        userId: socket.user?.userId,
      });
    });

    // Join user's personal room for DMs
    if (socket.user) {
      socket.join(`user:${socket.user.userId}`);
    }

    // Join DM conversation room
    socket.on('dm:join', (otherUserId: number) => {
      if (!socket.user) return;

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
    socket.on('dm:send', async (data: { toUserId: number; content: string }) => {
      if (!socket.user) return;

      try {
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
    socket.on('dm:typing:start', (toUserId: number) => {
      if (!socket.user) return;
      io.to(`user:${toUserId}`).emit('dm:typing:start', {
        userId: socket.user.userId,
        email: socket.user.email,
      });
    });

    socket.on('dm:typing:stop', (toUserId: number) => {
      if (!socket.user) return;
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

// Export for use in REST endpoints
export function isUserOnline(userId: number): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

export function getOnlineUserIds(): number[] {
  return Array.from(onlineUsers.keys());
}
