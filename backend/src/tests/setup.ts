import prisma from '../db.js';

beforeAll(async () => {
  // Clean database before tests
  await prisma.message.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
