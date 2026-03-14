import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import {
  wsHuddleInviteSchema,
  wsHuddleInviteResponseSchema,
  wsHuddleLeaveSchema,
  wsHuddleMuteSchema,
  wsHuddleSignalSchema,
} from '../middleware/authorize.js';
import prisma from '../db.js';
import { logError } from '../utils/logger.js';
import { DM_INCLUDE_USERS } from '../db/selects.js';

interface AuthenticatedSocket {
  id: string;
  user?: { userId: number; role?: string };
  emit(event: string, ...args: unknown[]): boolean;
}

interface HuddleInvite {
  id: string;
  fromUserId: number;
  toUserId: number;
  fromName: string;
  fromAvatar: string | null;
  createdAt: string;
  timeoutHandle: NodeJS.Timeout;
}

interface ActiveHuddle {
  id: string;
  userA: { userId: number; socketId: string; name: string; avatar: string | null; isMuted: boolean };
  userB: { userId: number; socketId: string; name: string; avatar: string | null; isMuted: boolean };
  startedAt: string;
}

const INVITE_TIMEOUT_MS = 60_000;

// Pending invites: inviteId -> HuddleInvite
const pendingInvites = new Map<string, HuddleInvite>();

// Active huddles: huddleId -> ActiveHuddle
const activeHuddles = new Map<string, ActiveHuddle>();

// User presence in huddle: userId -> huddleId
const userHuddleMap = new Map<number, string>();

// User's outgoing invites: userId -> Set<inviteId>
const userOutgoingInvites = new Map<number, Set<string>>();

// User's incoming invites: userId -> Set<inviteId>
const userIncomingInvites = new Map<number, Set<string>>();

// ── Helpers ──────────────────────────────────────────────────────────

function emitToUser(io: Server, onlineUsers: Map<number, Set<string>>, userId: number, event: string, data: unknown): void {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  for (const sid of sockets) {
    io.sockets.sockets.get(sid)?.emit(event, data);
  }
}

function cancelInvite(io: Server, onlineUsers: Map<number, Set<string>>, inviteId: string, reason: string): void {
  const invite = pendingInvites.get(inviteId);
  if (!invite) return;

  clearTimeout(invite.timeoutHandle);
  pendingInvites.delete(inviteId);

  // Remove from outgoing/incoming maps
  userOutgoingInvites.get(invite.fromUserId)?.delete(inviteId);
  userIncomingInvites.get(invite.toUserId)?.delete(inviteId);

  // Notify both parties
  const cancelData = { inviteId, reason };
  emitToUser(io, onlineUsers, invite.fromUserId, 'huddle:invite:cancelled', cancelData);
  emitToUser(io, onlineUsers, invite.toUserId, 'huddle:invite:cancelled', cancelData);
}

function cancelAllOutgoing(io: Server, onlineUsers: Map<number, Set<string>>, userId: number): void {
  const inviteIds = userOutgoingInvites.get(userId);
  if (!inviteIds) return;
  for (const inviteId of [...inviteIds]) {
    cancelInvite(io, onlineUsers, inviteId, 'cancelled');
  }
}

function cancelAllIncoming(io: Server, onlineUsers: Map<number, Set<string>>, userId: number): void {
  const inviteIds = userIncomingInvites.get(userId);
  if (!inviteIds) return;
  for (const inviteId of [...inviteIds]) {
    cancelInvite(io, onlineUsers, inviteId, 'cancelled');
  }
}

function endHuddle(io: Server, onlineUsers: Map<number, Set<string>>, huddleId: string, endedBy?: number): void {
  const huddle = activeHuddles.get(huddleId);
  if (!huddle) return;

  activeHuddles.delete(huddleId);
  userHuddleMap.delete(huddle.userA.userId);
  userHuddleMap.delete(huddle.userB.userId);

  const endData = { huddleId, endedBy };
  emitToUser(io, onlineUsers, huddle.userA.userId, 'huddle:ended', endData);
  emitToUser(io, onlineUsers, huddle.userB.userId, 'huddle:ended', endData);

  // Create "huddle ended" DM with duration
  const durationMs = Date.now() - new Date(huddle.startedAt).getTime();
  const durationSec = Math.round(durationMs / 1000);
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  // Determine who is userA/B for DM direction (use the person who ended as sender)
  const senderId = endedBy || huddle.userA.userId;
  const receiverId = senderId === huddle.userA.userId ? huddle.userB.userId : huddle.userA.userId;

  prisma.directMessage.create({
    data: {
      content: `[huddle:ended:${durationStr}]`,
      fromUserId: senderId,
      toUserId: receiverId,
    },
    include: DM_INCLUDE_USERS,
  }).then((dm) => {
    emitToUser(io, onlineUsers, huddle.userA.userId, 'dm:new', dm);
    emitToUser(io, onlineUsers, huddle.userB.userId, 'dm:new', dm);
  }).catch((err) => logError('Huddle ended DM error', err));
}

async function connectHuddle(
  io: Server,
  onlineUsers: Map<number, Set<string>>,
  inviterUserId: number,
  inviterSocketId: string,
  accepterUserId: number,
  accepterSocketId: string,
): Promise<void> {
  // Cancel all outgoing/incoming invites for both users
  cancelAllOutgoing(io, onlineUsers, inviterUserId);
  cancelAllOutgoing(io, onlineUsers, accepterUserId);
  cancelAllIncoming(io, onlineUsers, inviterUserId);
  cancelAllIncoming(io, onlineUsers, accepterUserId);

  // Look up user info
  let inviterName = 'Unknown', inviterAvatar: string | null = null;
  let accepterName = 'Unknown', accepterAvatar: string | null = null;
  try {
    const [inviter, accepter] = await Promise.all([
      prisma.user.findUnique({ where: { id: inviterUserId }, select: { name: true, avatar: true } }),
      prisma.user.findUnique({ where: { id: accepterUserId }, select: { name: true, avatar: true } }),
    ]);
    if (inviter) { inviterName = inviter.name; inviterAvatar = inviter.avatar; }
    if (accepter) { accepterName = accepter.name; accepterAvatar = accepter.avatar; }
  } catch (err) {
    logError('Huddle user lookup error', err);
  }

  const huddleId = randomUUID();
  const huddle: ActiveHuddle = {
    id: huddleId,
    userA: { userId: inviterUserId, socketId: inviterSocketId, name: inviterName, avatar: inviterAvatar, isMuted: false },
    userB: { userId: accepterUserId, socketId: accepterSocketId, name: accepterName, avatar: accepterAvatar, isMuted: false },
    startedAt: new Date().toISOString(),
  };

  activeHuddles.set(huddleId, huddle);
  userHuddleMap.set(inviterUserId, huddleId);
  userHuddleMap.set(accepterUserId, huddleId);

  // Emit connected to both — accepter is the WebRTC initiator
  emitToUser(io, onlineUsers, inviterUserId, 'huddle:connected', {
    huddleId,
    isInitiator: false,
    peer: { userId: accepterUserId, name: accepterName, avatar: accepterAvatar, isMuted: false },
  });
  emitToUser(io, onlineUsers, accepterUserId, 'huddle:connected', {
    huddleId,
    isInitiator: true,
    peer: { userId: inviterUserId, name: inviterName, avatar: inviterAvatar, isMuted: false },
  });

  // Create "huddle started" DM
  try {
    const dm = await prisma.directMessage.create({
      data: {
        content: '[huddle:started]',
        fromUserId: inviterUserId,
        toUserId: accepterUserId,
      },
      include: DM_INCLUDE_USERS,
    });
    emitToUser(io, onlineUsers, inviterUserId, 'dm:new', dm);
    emitToUser(io, onlineUsers, accepterUserId, 'dm:new', dm);
  } catch (err) {
    logError('Huddle started DM error', err);
  }
}

// ── Main Handler Registration ────────────────────────────────────────

export function registerHuddleHandlers(
  io: Server,
  socket: AuthenticatedSocket,
  onlineUsers: Map<number, Set<string>>,
  checkRateLimit: (userId: number, event: string) => boolean,
): void {
  const sock = socket as unknown as import('socket.io').Socket & AuthenticatedSocket;

  // ── Send invite ──
  sock.on('huddle:invite', async (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:invite')) {
      sock.emit('huddle:error', { message: 'Rate limit exceeded' });
      return;
    }

    const parsed = wsHuddleInviteSchema.safeParse(rawData);
    if (!parsed.success) {
      sock.emit('huddle:error', { message: 'Invalid invite payload' });
      return;
    }

    const { toUserId } = parsed.data;
    const userId = socket.user.userId;

    // Can't invite yourself
    if (toUserId === userId) {
      sock.emit('huddle:error', { message: 'Cannot invite yourself' });
      return;
    }

    // Check if already in a huddle
    if (userHuddleMap.has(userId)) {
      sock.emit('huddle:error', { message: 'Leave your current huddle first' });
      return;
    }

    // Check if target user exists and is active
    const targetUser = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, deactivatedAt: true },
    });
    if (!targetUser || targetUser.deactivatedAt) {
      sock.emit('huddle:error', { message: 'User not found' });
      return;
    }

    // Check if target is already in a huddle
    if (userHuddleMap.has(toUserId)) {
      sock.emit('huddle:invite:cancelled', { inviteId: 'none', reason: 'busy' });
      return;
    }

    // Check for simultaneous invite (B already invited A)
    const incomingIds = userIncomingInvites.get(userId);
    if (incomingIds) {
      for (const existingInviteId of incomingIds) {
        const existingInvite = pendingInvites.get(existingInviteId);
        if (existingInvite && existingInvite.fromUserId === toUserId) {
          // Auto-connect! Cancel the existing invite and connect directly
          clearTimeout(existingInvite.timeoutHandle);
          pendingInvites.delete(existingInviteId);
          userOutgoingInvites.get(toUserId)?.delete(existingInviteId);
          userIncomingInvites.get(userId)?.delete(existingInviteId);

          // Find socketIds
          const inviterSockets = onlineUsers.get(toUserId);
          const accepterSockets = onlineUsers.get(userId);
          const inviterSocketId = inviterSockets ? [...inviterSockets][0] : '';
          const accepterSocketId = accepterSockets ? [...accepterSockets][0] : socket.id;

          await connectHuddle(io, onlineUsers, toUserId, inviterSocketId, userId, accepterSocketId);
          return;
        }
      }
    }

    // Cancel any existing outgoing invites from this user
    cancelAllOutgoing(io, onlineUsers, userId);

    // Get inviter info
    let fromName = 'Unknown';
    let fromAvatar: string | null = null;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, avatar: true },
      });
      if (user) { fromName = user.name; fromAvatar = user.avatar; }
    } catch (err) {
      logError('Huddle invite user lookup error', err);
    }

    // Create invite
    const inviteId = randomUUID();
    const invite: HuddleInvite = {
      id: inviteId,
      fromUserId: userId,
      toUserId,
      fromName,
      fromAvatar,
      createdAt: new Date().toISOString(),
      timeoutHandle: setTimeout(() => {
        cancelInvite(io, onlineUsers, inviteId, 'timeout');
      }, INVITE_TIMEOUT_MS),
    };

    pendingInvites.set(inviteId, invite);

    if (!userOutgoingInvites.has(userId)) userOutgoingInvites.set(userId, new Set());
    userOutgoingInvites.get(userId)!.add(inviteId);

    if (!userIncomingInvites.has(toUserId)) userIncomingInvites.set(toUserId, new Set());
    userIncomingInvites.get(toUserId)!.add(inviteId);

    // Confirm to sender
    sock.emit('huddle:invite:sent', { inviteId, toUserId });

    // Notify recipient
    const expiresAt = new Date(Date.now() + INVITE_TIMEOUT_MS).toISOString();
    emitToUser(io, onlineUsers, toUserId, 'huddle:invite:received', {
      inviteId,
      fromUserId: userId,
      fromName,
      fromAvatar,
      expiresAt,
    });

    // Create DM for the invite
    try {
      const dm = await prisma.directMessage.create({
        data: {
          content: '[huddle:invite]',
          fromUserId: userId,
          toUserId,
        },
        include: DM_INCLUDE_USERS,
      });
      emitToUser(io, onlineUsers, userId, 'dm:new', dm);
      emitToUser(io, onlineUsers, toUserId, 'dm:new', dm);
    } catch (err) {
      logError('Huddle invite DM error', err);
    }
  });

  // ── Accept invite ──
  sock.on('huddle:invite:accept', async (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:invite:accept')) return;

    const parsed = wsHuddleInviteResponseSchema.safeParse(rawData);
    if (!parsed.success) {
      sock.emit('huddle:error', { message: 'Invalid accept payload' });
      return;
    }

    const { inviteId } = parsed.data;
    const invite = pendingInvites.get(inviteId);

    if (!invite || invite.toUserId !== socket.user.userId) {
      sock.emit('huddle:error', { message: 'Invite not found or expired' });
      return;
    }

    // Check if inviter is still available
    if (userHuddleMap.has(invite.fromUserId)) {
      cancelInvite(io, onlineUsers, inviteId, 'busy');
      sock.emit('huddle:error', { message: 'They are already in another huddle' });
      return;
    }

    // Check if accepter is already in a huddle
    if (userHuddleMap.has(socket.user.userId)) {
      sock.emit('huddle:error', { message: 'Leave your current huddle first' });
      return;
    }

    // Clear this invite
    clearTimeout(invite.timeoutHandle);
    pendingInvites.delete(inviteId);
    userOutgoingInvites.get(invite.fromUserId)?.delete(inviteId);
    userIncomingInvites.get(invite.toUserId)?.delete(inviteId);

    // Find inviter's socket
    const inviterSockets = onlineUsers.get(invite.fromUserId);
    const inviterSocketId = inviterSockets ? [...inviterSockets][0] : '';

    if (!inviterSocketId) {
      sock.emit('huddle:error', { message: 'They went offline' });
      return;
    }

    await connectHuddle(io, onlineUsers, invite.fromUserId, inviterSocketId, socket.user.userId, socket.id);
  });

  // ── Decline invite ──
  sock.on('huddle:invite:decline', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:invite:decline')) return;

    const parsed = wsHuddleInviteResponseSchema.safeParse(rawData);
    if (!parsed.success) return;

    const invite = pendingInvites.get(parsed.data.inviteId);
    if (!invite || invite.toUserId !== socket.user.userId) return;

    cancelInvite(io, onlineUsers, parsed.data.inviteId, 'declined');
  });

  // ── Cancel own invite ──
  sock.on('huddle:invite:cancel', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:invite:cancel')) return;

    const parsed = wsHuddleInviteResponseSchema.safeParse(rawData);
    if (!parsed.success) return;

    const invite = pendingInvites.get(parsed.data.inviteId);
    if (!invite || invite.fromUserId !== socket.user.userId) return;

    cancelInvite(io, onlineUsers, parsed.data.inviteId, 'cancelled');
  });

  // ── Leave huddle ──
  sock.on('huddle:leave', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:leave')) return;

    const parsed = wsHuddleLeaveSchema.safeParse(rawData);
    if (!parsed.success) return;

    const huddle = activeHuddles.get(parsed.data.huddleId);
    if (!huddle) return;

    // Verify user is a participant
    if (huddle.userA.userId !== socket.user.userId && huddle.userB.userId !== socket.user.userId) return;

    endHuddle(io, onlineUsers, parsed.data.huddleId, socket.user.userId);
  });

  // ── Toggle mute ──
  sock.on('huddle:mute', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:mute')) return;

    const parsed = wsHuddleMuteSchema.safeParse(rawData);
    if (!parsed.success) return;

    const huddle = activeHuddles.get(parsed.data.huddleId);
    if (!huddle) return;

    const userId = socket.user.userId;
    const { isMuted } = parsed.data;

    if (huddle.userA.userId === userId) {
      huddle.userA.isMuted = isMuted;
    } else if (huddle.userB.userId === userId) {
      huddle.userB.isMuted = isMuted;
    } else {
      return;
    }

    // Notify the other participant
    const otherId = huddle.userA.userId === userId ? huddle.userB.userId : huddle.userA.userId;
    emitToUser(io, onlineUsers, otherId, 'huddle:mute-changed', {
      huddleId: parsed.data.huddleId,
      userId,
      isMuted,
    });
    // Also confirm back to the sender
    emitToUser(io, onlineUsers, userId, 'huddle:mute-changed', {
      huddleId: parsed.data.huddleId,
      userId,
      isMuted,
    });
  });

  // ── WebRTC signaling ──
  sock.on('huddle:signal', (rawData: unknown) => {
    if (!socket.user) return;
    if (!checkRateLimit(socket.user.userId, 'huddle:signal')) return;

    const parsed = wsHuddleSignalSchema.safeParse(rawData);
    if (!parsed.success) return;

    const huddle = activeHuddles.get(parsed.data.huddleId);
    if (!huddle) return;

    const userId = socket.user.userId;

    // Determine the other user (only 2 in a huddle)
    let otherUserId: number;
    if (huddle.userA.userId === userId) {
      otherUserId = huddle.userB.userId;
    } else if (huddle.userB.userId === userId) {
      otherUserId = huddle.userA.userId;
    } else {
      return;
    }

    // Forward signal to the other user
    emitToUser(io, onlineUsers, otherUserId, 'huddle:signal', {
      huddleId: parsed.data.huddleId,
      fromUserId: userId,
      signal: parsed.data.signal,
    });
  });
}

// ── Disconnect Handler ───────────────────────────────────────────────

export function handleHuddleDisconnect(socket: AuthenticatedSocket, io: Server, onlineUsers: Map<number, Set<string>>): void {
  if (!socket.user) return;
  const userId = socket.user.userId;

  // Cancel outgoing invites
  const outgoing = userOutgoingInvites.get(userId);
  if (outgoing) {
    for (const inviteId of [...outgoing]) {
      cancelInvite(io, onlineUsers, inviteId, 'disconnected');
    }
  }

  // Cancel incoming invites
  const incoming = userIncomingInvites.get(userId);
  if (incoming) {
    for (const inviteId of [...incoming]) {
      cancelInvite(io, onlineUsers, inviteId, 'disconnected');
    }
  }

  // End active huddle if this is the socket that was in the huddle
  const huddleId = userHuddleMap.get(userId);
  if (huddleId) {
    const huddle = activeHuddles.get(huddleId);
    if (huddle) {
      // Only end if it's the actual socket in the huddle (multi-tab safety)
      const isHuddleSocket =
        (huddle.userA.userId === userId && huddle.userA.socketId === socket.id) ||
        (huddle.userB.userId === userId && huddle.userB.socketId === socket.id);

      if (isHuddleSocket) {
        endHuddle(io, onlineUsers, huddleId, userId);
      }
    }
  }
}
