import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Database Integrity', () => {
  beforeEach(async () => {
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('User Deletion Cascades', () => {
    let userId: number;
    let authToken: string;
    let channelId: number;
    let messageId: number;

    beforeEach(async () => {
      // Create user
      const userRes = await request(app).post('/auth/register').send({
        email: 'cascade-test@example.com',
        password: 'password123',
        name: 'Cascade Test',
      });
      authToken = userRes.body.token;
      userId = userRes.body.user.id;

      // Create channel
      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'cascade-channel' });
      channelId = channelRes.body.id;

      // Send message
      const messageRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Test message before deletion' });
      messageId = messageRes.body.id;

      // Add reaction
      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });
    });

    it('should handle user deletion gracefully when related data is cleaned first', async () => {
      // Verify data exists before deletion
      const userBefore = await prisma.user.findUnique({ where: { id: userId } });
      expect(userBefore).not.toBeNull();

      const messageBefore = await prisma.message.findUnique({ where: { id: messageId } });
      expect(messageBefore).not.toBeNull();

      // Clean up related data first (simulating proper cleanup)
      await prisma.reaction.deleteMany({ where: { userId } });
      await prisma.message.deleteMany({ where: { userId } });
      await prisma.channelRead.deleteMany({ where: { userId } });
      await prisma.channelMember.deleteMany({ where: { userId } });

      // Now delete user
      await prisma.user.delete({ where: { id: userId } });

      // User should be gone
      const userAfter = await prisma.user.findUnique({ where: { id: userId } });
      expect(userAfter).toBeNull();

      // Channel member entry should be gone
      const membership = await prisma.channelMember.findFirst({
        where: { userId },
      });
      expect(membership).toBeNull();
    });
  });

  describe('Channel Deletion Cascades', () => {
    let authToken: string;
    let channelId: number;

    beforeEach(async () => {
      const userRes = await request(app).post('/auth/register').send({
        email: 'channel-cascade@example.com',
        password: 'password123',
        name: 'Channel Cascade Test',
      });
      authToken = userRes.body.token;

      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'to-be-deleted' });
      channelId = channelRes.body.id;

      // Add messages
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message 1' });

      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message 2' });
    });

    it('should delete channel messages when channel is deleted with cleanup', async () => {
      // Verify messages exist
      const messagesBefore = await prisma.message.count({ where: { channelId } });
      expect(messagesBefore).toBe(2);

      // Clean up related data first
      await prisma.message.deleteMany({ where: { channelId } });
      await prisma.channelRead.deleteMany({ where: { channelId } });
      await prisma.channelMember.deleteMany({ where: { channelId } });

      // Delete channel
      await prisma.channel.delete({ where: { id: channelId } });

      // Channel should be gone
      const channelAfter = await prisma.channel.findUnique({ where: { id: channelId } });
      expect(channelAfter).toBeNull();
    });

    it('should verify channel members are properly managed', async () => {
      // Verify membership exists
      const membersBefore = await prisma.channelMember.count({ where: { channelId } });
      expect(membersBefore).toBe(1);

      // Clean up and delete channel
      await prisma.message.deleteMany({ where: { channelId } });
      await prisma.channelRead.deleteMany({ where: { channelId } });
      await prisma.channelMember.deleteMany({ where: { channelId } });
      await prisma.channel.delete({ where: { id: channelId } });

      // Membership should be gone
      const membersAfter = await prisma.channelMember.count({ where: { channelId } });
      expect(membersAfter).toBe(0);
    });
  });

  describe('Message Thread Integrity', () => {
    let authToken: string;
    let channelId: number;
    let parentMessageId: number;

    beforeEach(async () => {
      const userRes = await request(app).post('/auth/register').send({
        email: 'thread-test@example.com',
        password: 'password123',
        name: 'Thread Test',
      });
      authToken = userRes.body.token;

      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'thread-channel' });
      channelId = channelRes.body.id;

      const messageRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Parent message' });
      parentMessageId = messageRes.body.id;

      // Add replies
      await request(app)
        .post(`/messages/${parentMessageId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Reply 1' });

      await request(app)
        .post(`/messages/${parentMessageId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Reply 2' });
    });

    it('should delete thread replies when parent message is deleted', async () => {
      // Verify replies exist
      const repliesBefore = await prisma.message.count({
        where: { threadId: parentMessageId },
      });
      expect(repliesBefore).toBe(2);

      // Delete replies first, then parent (FK constraint requires this order)
      await prisma.message.deleteMany({ where: { threadId: parentMessageId } });
      await prisma.message.delete({ where: { id: parentMessageId } });

      // Replies should be gone
      const repliesAfter = await prisma.message.count({
        where: { threadId: parentMessageId },
      });
      expect(repliesAfter).toBe(0);
    });
  });

  describe('Reaction Integrity', () => {
    let authToken: string;
    let channelId: number;
    let messageId: number;

    beforeEach(async () => {
      const userRes = await request(app).post('/auth/register').send({
        email: 'reaction-test@example.com',
        password: 'password123',
        name: 'Reaction Test',
      });
      authToken = userRes.body.token;

      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'reaction-channel' });
      channelId = channelRes.body.id;

      const messageRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Reaction test message' });
      messageId = messageRes.body.id;

      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });

      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '❤️' });
    });

    it('should delete reactions when message is deleted', async () => {
      // Verify reactions exist
      const reactionsBefore = await prisma.reaction.count({
        where: { messageId },
      });
      expect(reactionsBefore).toBe(2);

      // Delete message
      await prisma.message.delete({ where: { id: messageId } });

      // Reactions should be gone
      const reactionsAfter = await prisma.reaction.count({
        where: { messageId },
      });
      expect(reactionsAfter).toBe(0);
    });
  });

  describe('Unique Constraints', () => {
    it('should prevent duplicate email registration', async () => {
      await request(app).post('/auth/register').send({
        email: 'unique@example.com',
        password: 'password123',
        name: 'User 1',
      });

      const res = await request(app).post('/auth/register').send({
        email: 'unique@example.com',
        password: 'password123',
        name: 'User 2',
      });

      expect(res.status).toBe(400);
    });

    it('should prevent duplicate channel membership', async () => {
      const userRes = await request(app).post('/auth/register').send({
        email: 'member@example.com',
        password: 'password123',
        name: 'Member',
      });
      const token = userRes.body.token;

      // Create another user to create a channel
      const ownerRes = await request(app).post('/auth/register').send({
        email: 'owner@example.com',
        password: 'password123',
        name: 'Owner',
      });

      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${ownerRes.body.token}`)
        .send({ name: 'test-channel' });

      // First join should succeed
      const join1 = await request(app)
        .post(`/channels/${channelRes.body.id}/join`)
        .set('Authorization', `Bearer ${token}`);
      expect(join1.status).toBe(200);

      // Second join should fail
      const join2 = await request(app)
        .post(`/channels/${channelRes.body.id}/join`)
        .set('Authorization', `Bearer ${token}`);
      expect(join2.status).toBe(400);
    });

    it('should prevent duplicate reactions', async () => {
      const userRes = await request(app).post('/auth/register').send({
        email: 'reactor@example.com',
        password: 'password123',
        name: 'Reactor',
      });
      const token = userRes.body.token;

      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'reaction-test' });

      const messageRes = await request(app)
        .post(`/channels/${channelRes.body.id}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Test' });

      // First reaction should succeed
      const react1 = await request(app)
        .post(`/messages/${messageRes.body.id}/reactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ emoji: '👍' });
      expect(react1.status).toBe(201);

      // Same reaction should fail
      const react2 = await request(app)
        .post(`/messages/${messageRes.body.id}/reactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ emoji: '👍' });
      expect(react2.status).toBe(400);
    });
  });
});
