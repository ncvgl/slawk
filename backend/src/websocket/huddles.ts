import { Server } from 'socket.io';
import {
  checkChannelMembership,
  wsHuddleJoinSchema,
  wsHuddleLeaveSchema,
  wsHuddleMuteSchema,
  wsHuddleSignalSchema,
} from '../middleware/authorize.js';
import prisma from '../db.js';
import { logError } from '../utils/logger.js';

interface AuthenticatedSocket {
  id: string;
  user?: { userId: number; role?: string };
  emit(event: string, ...args: unknown[]): boolean;
}

interface HuddleParticipant {
  userId: number;
  name: string;
  avatar: string | null;
  socketId: string;
  isMuted: boolean;
  joinedAt: string;
}

interface HuddleState {
  channelId: number;
  startedBy: number;
  startedAt: string;
  participants: Map<number, HuddleParticipant>;
}

const MAX_PARTICIPANTS = 10;
const activeHuddles = new Map<number, HuddleState>();

// Track which huddle each user is in (userId -> channelId)
const userHuddleMap = new Map<number, number>();

function participantsArray(huddle: HuddleState): Omit<HuddleParticipant, 'socketId'>[] {
  return Array.from(huddle.participants.values()).map(({ socketId: _, ...rest }) => rest);
}

export function registerHuddleHandlers(
  io: Server,
  socket: AuthenticatedSocket,
  onlineUsers: Map<number, Set<string>>,
  checkRateLimit: (userId: number, event: string) => boolean,
): void {
  // Join or start a huddle
  socket.emit; // just for type narrowing
  const sock = socket as unknown as import('socket.io').Socket & AuthenticatedSocket;

  sock.on('huddle:join', async (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:join')) {
      sock.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    const parsed = wsHuddleJoinSchema.safeParse(rawData);
    if (!parsed.success) {
      sock.emit('error', { message: 'Invalid huddle join payload' });
      return;
    }

    const { channelId } = parsed.data;
    const userId = socket.user.userId;

    // Negative channelId = DM huddle (channelId is -otherUserId)
    const isDMHuddle = channelId < 0;

    if (isDMHuddle) {
      // For DM huddles, limit to 2 participants
      const huddle = activeHuddles.get(channelId);
      if (huddle && huddle.participants.size >= 2 && !huddle.participants.has(userId)) {
        sock.emit('error', { message: 'DM huddle is full (max 2 participants)' });
        return;
      }
    } else {
      // Check channel membership
      const isMember = await checkChannelMembership(userId, channelId);
      if (!isMember) {
        sock.emit('error', { message: 'You must be a member of the channel' });
        return;
      }

      // Check if channel is archived
      try {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { archivedAt: true },
        });
        if (channel?.archivedAt) {
          sock.emit('error', { message: 'Cannot start huddle in archived channel' });
          return;
        }
      } catch (err) {
        logError('Huddle channel check error', err);
        sock.emit('error', { message: 'Failed to join huddle' });
        return;
      }
    }

    // If user is already in a different huddle, leave it first
    const currentHuddleChannel = userHuddleMap.get(userId);
    if (currentHuddleChannel && currentHuddleChannel !== channelId) {
      removeParticipant(io, userId, currentHuddleChannel, onlineUsers);
    }

    // If already in this huddle, ignore
    if (currentHuddleChannel === channelId) {
      return;
    }

    // Get or create huddle
    let huddle = activeHuddles.get(channelId);
    if (!huddle) {
      huddle = {
        channelId,
        startedBy: userId,
        startedAt: new Date().toISOString(),
        participants: new Map(),
      };
      activeHuddles.set(channelId, huddle);
    }

    // Check max participants
    if (huddle.participants.size >= MAX_PARTICIPANTS) {
      sock.emit('error', { message: 'Huddle is full (max 10 participants)' });
      return;
    }

    // Get user info
    let userName = 'Unknown';
    let userAvatar: string | null = null;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, avatar: true },
      });
      if (user) {
        userName = user.name;
        userAvatar = user.avatar;
      }
    } catch (err) {
      logError('Huddle user lookup error', err);
    }

    const participant: HuddleParticipant = {
      userId,
      name: userName,
      avatar: userAvatar,
      socketId: socket.id,
      isMuted: false,
      joinedAt: new Date().toISOString(),
    };

    huddle.participants.set(userId, participant);
    userHuddleMap.set(userId, channelId);

    // Join the huddle socket room
    sock.join(`huddle:${channelId}`);

    // Send full state to the joiner
    sock.emit('huddle:state', {
      channelId,
      participants: participantsArray(huddle),
    });

    // Notify other huddle participants that someone joined
    sock.to(`huddle:${channelId}`).emit('huddle:participant-joined', {
      channelId,
      participant: { userId, name: userName, avatar: userAvatar, isMuted: false, joinedAt: participant.joinedAt },
    });

    if (isDMHuddle) {
      // For DM huddles, notify the other user directly via their sockets
      const otherUserId = -channelId;
      const otherSockets = onlineUsers.get(otherUserId);
      if (otherSockets) {
        for (const sid of otherSockets) {
          const otherSock = io.sockets.sockets.get(sid);
          if (otherSock) {
            otherSock.emit('huddle:active', {
              channelId,
              participantCount: huddle.participants.size,
              participants: participantsArray(huddle),
            });
          }
        }
      }

      // Send a DM notification to invite the other user
      if (huddle.participants.size === 1) {
        // Only send invite when huddle is first created (1 participant = the starter)
        try {
          const dm = await prisma.directMessage.create({
            data: {
              content: `Started a huddle. Join to talk!`,
              fromUserId: userId,
              toUserId: otherUserId,
            },
            include: {
              fromUser: { select: { id: true, name: true, avatar: true } },
              toUser: { select: { id: true, name: true, avatar: true } },
            },
          });
          // Broadcast to both users
          const bothUserIds = [userId, otherUserId];
          for (const uid of bothUserIds) {
            const sockets = onlineUsers.get(uid);
            if (sockets) {
              for (const sid of sockets) {
                io.sockets.sockets.get(sid)?.emit('dm:new', dm);
              }
            }
          }
        } catch (err) {
          logError('Huddle DM invite error', err);
        }
      }
    } else {
      // Broadcast active huddle state to the channel room (for indicator)
      io.to(`channel:${channelId}`).emit('huddle:active', {
        channelId,
        participantCount: huddle.participants.size,
        participants: participantsArray(huddle),
      });
    }
  });

  // Leave a huddle
  sock.on('huddle:leave', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:leave')) return;

    const parsed = wsHuddleLeaveSchema.safeParse(rawData);
    if (!parsed.success) return;

    removeParticipant(io, socket.user.userId, parsed.data.channelId, onlineUsers);
    sock.leave(`huddle:${parsed.data.channelId}`);
  });

  // Toggle mute
  sock.on('huddle:mute', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:mute')) return;

    const parsed = wsHuddleMuteSchema.safeParse(rawData);
    if (!parsed.success) return;

    const { channelId, isMuted } = parsed.data;
    const huddle = activeHuddles.get(channelId);
    if (!huddle) return;

    const participant = huddle.participants.get(socket.user.userId);
    if (!participant) return;

    participant.isMuted = isMuted;

    // Broadcast mute change to all huddle participants
    io.to(`huddle:${channelId}`).emit('huddle:mute-changed', {
      channelId,
      userId: socket.user.userId,
      isMuted,
    });
  });

  // Toggle video
  sock.on('huddle:video', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:mute')) return;

    const parsed = wsHuddleMuteSchema.safeParse(rawData);
    if (!parsed.success) return;

    const channelId = (rawData as { channelId: number }).channelId;
    const isVideoOn = (rawData as { isVideoOn: boolean }).isVideoOn;
    if (typeof channelId !== 'number' || typeof isVideoOn !== 'boolean') return;

    const huddle = activeHuddles.get(channelId);
    if (!huddle) return;

    const participant = huddle.participants.get(socket.user.userId);
    if (!participant) return;

    io.to(`huddle:${channelId}`).emit('huddle:video-changed', {
      channelId,
      userId: socket.user.userId,
      isVideoOn,
    });
  });

  // Forward WebRTC signaling
  sock.on('huddle:signal', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:signal')) return;

    const parsed = wsHuddleSignalSchema.safeParse(rawData);
    if (!parsed.success) return;

    const { channelId, toUserId, signal } = parsed.data;
    const huddle = activeHuddles.get(channelId);
    if (!huddle) return;

    // Verify both users are in the huddle
    if (!huddle.participants.has(socket.user.userId)) return;
    const targetParticipant = huddle.participants.get(toUserId);
    if (!targetParticipant) return;

    // Forward signal to the target user's socket
    const targetSockets = onlineUsers.get(toUserId);
    if (targetSockets) {
      for (const targetSocketId of targetSockets) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit('huddle:signal', {
            channelId,
            fromUserId: socket.user.userId,
            signal,
          });
        }
      }
    }
  });
}

function removeParticipant(io: Server, userId: number, channelId: number, onlineUsers?: Map<number, Set<string>>): void {
  const huddle = activeHuddles.get(channelId);
  if (!huddle) return;

  huddle.participants.delete(userId);
  userHuddleMap.delete(userId);
  const isDM = channelId < 0;

  if (huddle.participants.size === 0) {
    activeHuddles.delete(channelId);
    if (isDM && onlineUsers) {
      // Notify both DM users that huddle ended
      const otherUserId = -channelId;
      for (const uid of [userId, otherUserId]) {
        const sockets = onlineUsers.get(uid);
        if (sockets) {
          for (const sid of sockets) {
            io.sockets.sockets.get(sid)?.emit('huddle:ended', { channelId });
          }
        }
      }
    } else {
      io.to(`channel:${channelId}`).emit('huddle:ended', { channelId });
    }
  } else {
    io.to(`huddle:${channelId}`).emit('huddle:participant-left', { channelId, userId });
    if (isDM && onlineUsers) {
      const otherUserId = -channelId;
      for (const uid of [userId, otherUserId]) {
        const sockets = onlineUsers.get(uid);
        if (sockets) {
          for (const sid of sockets) {
            io.sockets.sockets.get(sid)?.emit('huddle:active', {
              channelId,
              participantCount: huddle.participants.size,
              participants: participantsArray(huddle),
            });
          }
        }
      }
    } else {
      io.to(`channel:${channelId}`).emit('huddle:active', {
        channelId,
        participantCount: huddle.participants.size,
        participants: participantsArray(huddle),
      });
    }
  }
}

export function handleHuddleDisconnect(socket: AuthenticatedSocket, io: Server, onlineUsers?: Map<number, Set<string>>): void {
  if (!socket.user) return;
  const channelId = userHuddleMap.get(socket.user.userId);
  if (channelId !== undefined) {
    removeParticipant(io, socket.user.userId, channelId, onlineUsers);
  }
}

export function getActiveHuddle(channelId: number) {
  const huddle = activeHuddles.get(channelId);
  if (!huddle) return null;
  return {
    channelId,
    participantCount: huddle.participants.size,
    participants: participantsArray(huddle),
  };
}
