import prisma from './db.js';
import { getIO } from './websocket/index.js';
import { USER_SELECT_BASIC, FILE_SELECT } from './db/selects.js';
import { logError } from './utils/logger.js';

const INTERVAL_MS = 30_000; // 30 seconds

export function startScheduler(): NodeJS.Timeout {
  console.log('Scheduler started — checking every 30s for due messages');

  const handle = setInterval(async () => {
    try {
      const due = await prisma.scheduledMessage.findMany({
        where: {
          sent: false,
          scheduledAt: { lte: new Date() },
        },
        include: {
          user: { select: USER_SELECT_BASIC },
          channel: { select: { id: true, name: true } },
        },
        take: 50, // process up to 50 per tick
      });

      if (due.length === 0) return;

      const io = getIO();

      for (const scheduled of due) {
        try {
          // Verify user is not deactivated
          const user = await prisma.user.findUnique({
            where: { id: scheduled.userId },
            select: { deactivatedAt: true },
          });

          if (user?.deactivatedAt) {
            // User has been deactivated — cancel the scheduled message
            await prisma.scheduledMessage.update({
              where: { id: scheduled.id },
              data: { sent: true },
            });
            console.log(
              `Scheduler: cancelled scheduled message ${scheduled.id} — user ${scheduled.userId} has been deactivated`
            );
            continue;
          }

          // Verify user is still a member of the channel
          const membership = await prisma.channelMember.findUnique({
            where: {
              userId_channelId: {
                userId: scheduled.userId,
                channelId: scheduled.channelId,
              },
            },
          });

          if (!membership) {
            // User is no longer a member — cancel the scheduled message
            await prisma.scheduledMessage.update({
              where: { id: scheduled.id },
              data: { sent: true },
            });
            console.log(
              `Scheduler: cancelled scheduled message ${scheduled.id} — user ${scheduled.userId} is no longer a member of channel ${scheduled.channelId}`
            );
            continue;
          }

          // Verify channel is not archived
          const channel = await prisma.channel.findUnique({
            where: { id: scheduled.channelId },
            select: { archivedAt: true },
          });
          if (channel?.archivedAt) {
            await prisma.scheduledMessage.update({
              where: { id: scheduled.id },
              data: { sent: true },
            });
            console.log(
              `Scheduler: cancelled scheduled message ${scheduled.id} — channel ${scheduled.channelId} has been archived`
            );
            continue;
          }

          // Atomically claim and create message to prevent duplicates on crash
          const message = await prisma.$transaction(async (tx) => {
            const claimed = await tx.scheduledMessage.updateMany({
              where: { id: scheduled.id, sent: false },
              data: { sent: true },
            });
            if (claimed.count === 0) return null; // Already processed

            return tx.message.create({
              data: {
                content: scheduled.content,
                userId: scheduled.userId,
                channelId: scheduled.channelId,
              },
              include: {
                user: { select: USER_SELECT_BASIC },
                files: { select: FILE_SELECT },
              },
            });
          });

          if (!message) continue; // Already claimed by another instance

          // Broadcast via WebSocket to the channel
          if (io) {
            io.to(`channel:${scheduled.channelId}`).emit('message:new', message);
          }

          console.log(
            `Scheduler: sent message ${message.id} to channel ${scheduled.channelId} (was scheduled ${scheduled.id})`
          );
        } catch (err) {
          logError(`Scheduler: failed to send scheduled message ${scheduled.id}`, err);
        }
      }
    } catch (err) {
      logError('Scheduler tick error', err);
    }
  }, INTERVAL_MS);

  return handle;
}
