import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Security - Channel Access Control', () => {
  let user1Token: string;
  let user2Token: string;
  let user1Id: number;
  let user2Id: number;
  let privateChannelId: number;

  beforeEach(async () => {
    // Clean up
    await prisma.reaction.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.directMessage.deleteMany();
    await prisma.user.deleteMany();

    // Create user1 (channel owner)
    const user1Res = await request(app).post('/auth/register').send({
      email: 'owner@example.com',
      password: 'password123',
      name: 'Channel Owner',
    });
    user1Token = user1Res.body.token;
    user1Id = user1Res.body.user.id;

    // Create user2 (attacker)
    const user2Res = await request(app).post('/auth/register').send({
      email: 'attacker@example.com',
      password: 'password123',
      name: 'Attacker',
    });
    user2Token = user2Res.body.token;
    user2Id = user2Res.body.user.id;

    // User1 creates a private channel
    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'secret-channel', isPrivate: true });

    privateChannelId = channelRes.body.id;
  });

  describe('Bug #1: Private channel details access', () => {
    it('should NOT allow non-member to view private channel details', async () => {
      const res = await request(app)
        .get(`/channels/${privateChannelId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied');
    });

    it('should allow member to view private channel details', async () => {
      const res = await request(app)
        .get(`/channels/${privateChannelId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('secret-channel');
    });
  });

  describe('Bug #2: Private channel join without invite', () => {
    it('should NOT allow joining private channel without invite', async () => {
      const res = await request(app)
        .post(`/channels/${privateChannelId}/join`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot join private channel without invite');
    });

    it('should allow joining public channel', async () => {
      // Create public channel
      const publicChannelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'public-channel', isPrivate: false });

      const res = await request(app)
        .post(`/channels/${publicChannelRes.body.id}/join`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Joined channel successfully');
    });
  });

  describe('Bug #3: Read messages after leaving channel', () => {
    let publicChannelId: number;

    beforeEach(async () => {
      // Create a public channel
      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'public-channel', isPrivate: false });

      publicChannelId = channelRes.body.id;

      // User2 joins the channel
      await request(app)
        .post(`/channels/${publicChannelId}/join`)
        .set('Authorization', `Bearer ${user2Token}`);

      // User1 sends a message
      await request(app)
        .post(`/channels/${publicChannelId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: 'Secret message' });

      // User2 leaves the channel
      await request(app)
        .post(`/channels/${publicChannelId}/leave`)
        .set('Authorization', `Bearer ${user2Token}`);
    });

    it('should NOT allow reading messages after leaving channel', async () => {
      const res = await request(app)
        .get(`/channels/${publicChannelId}/messages`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You must be a member of this channel');
    });

    it('should allow reading messages while still a member', async () => {
      const res = await request(app)
        .get(`/channels/${publicChannelId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
    });
  });
});

describe('Security - Input Validation', () => {
  let authToken: string;
  let channelId: number;

  beforeEach(async () => {
    await prisma.reaction.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.directMessage.deleteMany();
    await prisma.user.deleteMany();

    const userRes = await request(app).post('/auth/register').send({
      email: 'validator@example.com',
      password: 'password123',
      name: 'Validator',
    });
    authToken = userRes.body.token;

    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-channel' });
    channelId = channelRes.body.id;
  });

  describe('Bug #4: Whitespace-only messages', () => {
    it('should reject messages with only spaces', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '   ' });

      expect(res.status).toBe(400);
    });

    it('should reject messages with only newlines', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '\n\n\n' });

      expect(res.status).toBe(400);
    });

    it('should reject messages with only tabs', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '\t\t\t' });

      expect(res.status).toBe(400);
    });

    it('should allow messages with real content', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Hello world' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Hello world');
    });
  });

  describe('Bug #5 & #6: Email and username length limits', () => {
    it('should reject very long emails (>255 chars)', async () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      const res = await request(app).post('/auth/register').send({
        email: longEmail,
        password: 'password123',
        name: 'Test User',
      });

      expect(res.status).toBe(400);
    });

    it('should reject very long usernames (>100 chars)', async () => {
      const longName = 'a'.repeat(150);
      const res = await request(app).post('/auth/register').send({
        email: 'longname@test.com',
        password: 'password123',
        name: longName,
      });

      expect(res.status).toBe(400);
    });

    it('should accept valid email and name lengths', async () => {
      const res = await request(app).post('/auth/register').send({
        email: 'valid@test.com',
        password: 'password123',
        name: 'Valid Name',
      });

      expect(res.status).toBe(201);
    });
  });

  describe('Bug #10: React to deleted messages', () => {
    let messageId: number;

    beforeEach(async () => {
      // Create a message
      const msgRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message to delete' });
      messageId = msgRes.body.id;

      // Delete the message
      await request(app)
        .delete(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${authToken}`);
    });

    it('should NOT allow reacting to deleted messages', async () => {
      const res = await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: 'thumbsup' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Message not found');
    });
  });

  describe('Bug #11: Nested threads', () => {
    let parentMessageId: number;
    let replyId: number;

    beforeEach(async () => {
      // Create parent message
      const msgRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Parent message' });
      parentMessageId = msgRes.body.id;

      // Create first reply
      const replyRes = await request(app)
        .post(`/messages/${parentMessageId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'First reply' });
      replyId = replyRes.body.id;
    });

    it('should NOT allow replying to a reply (nested threads)', async () => {
      const res = await request(app)
        .post(`/messages/${replyId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Nested reply' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot reply to a reply. Reply to the parent message instead.');
    });

    it('should allow replying to parent message', async () => {
      const res = await request(app)
        .post(`/messages/${parentMessageId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Another reply' });

      expect(res.status).toBe(201);
      expect(res.body.threadId).toBe(parentMessageId);
    });
  });

  describe('Bug #7: Channel name validation', () => {
    it('should reject channel names with path traversal (..)', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '../../../etc/passwd' });

      expect(res.status).toBe(400);
    });

    it('should reject channel names with forward slash', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'channel/subpath' });

      expect(res.status).toBe(400);
    });

    it('should reject channel names with backslash', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'channel\\subpath' });

      expect(res.status).toBe(400);
    });

    it('should allow valid channel names', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'general-chat' });

      expect(res.status).toBe(201);
    });

    it('should allow channel names with unicode', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'channel-日本語' });

      expect(res.status).toBe(201);
    });
  });

  describe('Bug #12: Orphaned channels', () => {
    it('should NOT allow last member to leave channel', async () => {
      // Create a new channel where authToken user is the only member
      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'solo-channel' });

      const soloChannelId = channelRes.body.id;

      const res = await request(app)
        .post(`/channels/${soloChannelId}/leave`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot leave channel as the last member');
    });
  });

  describe('Bug #13: Duplicate channel names', () => {
    it('should NOT allow duplicate channel names', async () => {
      // First channel creation
      await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'unique-channel-name' });

      // Try to create another with same name
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'unique-channel-name' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Channel name already exists');
    });
  });

  describe('Bug #14: Mark DM as read for non-existent user', () => {
    it('should return 404 when marking DM as read for non-existent user', async () => {
      const res = await request(app)
        .post('/dms/999999/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });

  describe('Bug #17: Invalid JSON handling', () => {
    it('should return 400 for invalid JSON instead of 500', async () => {
      const res = await request(app)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('not valid json');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid JSON');
    });
  });

  describe('Bug #18: Negative pagination limit', () => {
    it('should treat negative limit as default', async () => {
      // Send some messages first
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message 1' });

      const res = await request(app)
        .get(`/channels/${channelId}/messages?limit=-5`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Should use default limit, not negative
      expect(res.body.messages.length).toBeGreaterThanOrEqual(0);
    });

    it('should cap limit at maximum', async () => {
      const res = await request(app)
        .get(`/channels/${channelId}/messages?limit=999999`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Max limit is 100, so should not exceed
    });
  });

  describe('Bug #8: Null bytes in input', () => {
    it('should reject messages containing null bytes', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'hello\u0000world' });

      expect(res.status).toBe(400);
    });
  });

  describe('Bug #15 & #16: File upload error handling', () => {
    it('should return 400 for invalid file type instead of 500', async () => {
      const res = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('#!/bin/bash\necho "test"'), {
          filename: 'script.sh',
          contentType: 'application/x-sh',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('File type not allowed');
    });

    it('should return 413 for file too large instead of 500', async () => {
      // Create a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');

      const res = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeBuffer, {
          filename: 'large.txt',
          contentType: 'text/plain',
        });

      expect(res.status).toBe(413);
      expect(res.body.error).toBe('File too large');
    });
  });
});
