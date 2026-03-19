import prisma from '../db.js';
import { clearTokenCache } from '../middleware/auth.js';

beforeEach(() => {
  clearTokenCache();
});

beforeAll(async () => {
  // Clean database before tests
  await prisma.auditLog.deleteMany();
  await prisma.inviteLink.deleteMany();
  await prisma.bookmark.deleteMany();
  await prisma.scheduledMessage.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.file.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channelRead.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.directMessage.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
