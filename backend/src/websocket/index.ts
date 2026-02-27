import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { JwtPayload } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
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

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.user?.email} connected`);

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
    socket.on('message:send', async (data: { channelId: number; content: string; threadId?: number }) => {
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
          },
        });

        // Broadcast to all users in the channel
        io.to(`channel:${data.channelId}`).emit('message:new', message);
      } catch (error) {
        console.error('WebSocket message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
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

    socket.on('disconnect', () => {
      console.log(`User ${socket.user?.email} disconnected`);
    });
  });

  return io;
}
