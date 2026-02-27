import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../app.js';
import prisma from '../db.js';

describe('Messages', () => {
  let authToken: string;
  let channelId: number;

  const testUser = {
    email: 'message-test@example.com',
    password: 'password123',
    name: 'Message Test User',
  };

  beforeEach(async () => {
    await prisma.directMessage.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    const userRes = await request(app).post('/auth/register').send(testUser);
    authToken = userRes.body.token;

    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-channel' });

    channelId = channelRes.body.id;
  });

  describe('POST /channels/:id/messages', () => {
    it('should send a message to a channel', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Hello, world!' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Hello, world!');
      expect(res.body.channelId).toBe(channelId);
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should require channel membership', async () => {
      // Create another user
      const user2Res = await request(app).post('/auth/register').send({
        email: 'user2@example.com',
        password: 'password123',
        name: 'User 2',
      });

      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(403);
    });

    it('should validate message content', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '' });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /channels/:id/messages', () => {
    beforeEach(async () => {
      // Send multiple messages
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ content: `Message ${i + 1}` });
      }
    });

    it('should get messages from a channel', async () => {
      const res = await request(app)
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(5);
      expect(res.body.hasMore).toBe(false);
    });

    it('should paginate messages', async () => {
      const res = await request(app)
        .get(`/channels/${channelId}/messages?limit=2`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.nextCursor).toBeDefined();
    });

    it('should use cursor for pagination', async () => {
      const firstPage = await request(app)
        .get(`/channels/${channelId}/messages?limit=2`)
        .set('Authorization', `Bearer ${authToken}`);

      const secondPage = await request(app)
        .get(`/channels/${channelId}/messages?limit=2&cursor=${firstPage.body.nextCursor}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(secondPage.status).toBe(200);
      expect(secondPage.body.messages).toHaveLength(2);
      // Messages should be different from first page
      expect(secondPage.body.messages[0].id).not.toBe(firstPage.body.messages[0].id);
    });
  });

  describe('Thread functionality', () => {
    let messageId: number;

    beforeEach(async () => {
      const messageRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Parent message' });

      messageId = messageRes.body.id;
    });

    it('should reply to a message', async () => {
      const res = await request(app)
        .post(`/messages/${messageId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Reply message' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Reply message');
      expect(res.body.threadId).toBe(messageId);
    });

    it('should get thread messages', async () => {
      await request(app)
        .post(`/messages/${messageId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Reply 1' });

      await request(app)
        .post(`/messages/${messageId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Reply 2' });

      const res = await request(app)
        .get(`/messages/${messageId}/thread`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.parent.id).toBe(messageId);
      expect(res.body.replies).toHaveLength(2);
    });

    it('should return 404 for non-existent parent message', async () => {
      const res = await request(app)
        .post('/messages/99999/reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Reply' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /search', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Hello world' });

      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Goodbye world' });

      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Something else' });
    });

    it('should search messages', async () => {
      const res = await request(app)
        .get('/search?q=world')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
    });

    it('should be case insensitive', async () => {
      const res = await request(app)
        .get('/search?q=WORLD')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
    });

    it('should require minimum query length', async () => {
      const res = await request(app)
        .get('/search?q=a')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
    });

    it('should only search in user channels', async () => {
      // Create another user with their own channel and message
      const user2Res = await request(app).post('/auth/register').send({
        email: 'user2@example.com',
        password: 'password123',
        name: 'User 2',
      });

      const channel2Res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ name: 'user2-channel' });

      await request(app)
        .post(`/channels/${channel2Res.body.id}/messages`)
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ content: 'world in another channel' });

      // User 1 should not see user 2's message
      const res = await request(app)
        .get('/search?q=world')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2); // Only messages from user 1's channel
    });

    it('should return counts in response', async () => {
      const res = await request(app)
        .get('/search?q=world')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('counts');
      expect(res.body.counts).toHaveProperty('messages');
      expect(res.body.counts).toHaveProperty('dms');
      expect(res.body.counts).toHaveProperty('total');
    });

    it('should return empty results when no matches', async () => {
      const res = await request(app)
        .get('/search?q=nonexistentkeyword')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
      expect(res.body.counts.total).toBe(0);
    });

    it('should handle special characters in query', async () => {
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Test @mention #hashtag' });

      const res = await request(app)
        .get('/search?q=@mention')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Should not crash, may or may not find results depending on implementation
    });

    it('should not search deleted messages', async () => {
      // Create and delete a message
      const msgRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'deletable unique keyword' });

      await request(app)
        .delete(`/messages/${msgRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .get('/search?q=deletable')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });

    it('should filter by channelId', async () => {
      // Create second channel
      const channel2Res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'test-channel-2' });

      await request(app)
        .post(`/channels/${channel2Res.body.id}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'world in channel 2' });

      // Search with channelId filter
      const res = await request(app)
        .get(`/search?q=world&channelId=${channelId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Should only return messages from channel 1
      res.body.results.forEach((result: any) => {
        if (result.type === 'message') {
          expect(result.channel.id).toBe(channelId);
        }
      });
    });
  });

  describe('Search - DM Support', () => {
    let user2Token: string;
    let user2Id: number;

    beforeEach(async () => {
      const user2Res = await request(app).post('/auth/register').send({
        email: 'searchdm@example.com',
        password: 'password123',
        name: 'Search DM User',
      });
      user2Token = user2Res.body.token;
      user2Id = user2Res.body.user.id;

      // Send some DMs
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ toUserId: user2Id, content: 'searchable dm content' });

      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ toUserId: user2Id, content: 'another dm message' });
    });

    it('should search DM messages with type=dms', async () => {
      const res = await request(app)
        .get('/search?q=searchable&type=dms')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThanOrEqual(1);
      res.body.results.forEach((result: any) => {
        expect(result.type).toBe('dm');
      });
    });

    it('should search both channels and DMs with type=all', async () => {
      // Create channel message with same keyword
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'searchable channel content' });

      const res = await request(app)
        .get('/search?q=searchable')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const types = res.body.results.map((r: any) => r.type);
      expect(types).toContain('message');
      expect(types).toContain('dm');
    });

    it('should filter by type=messages (channels only)', async () => {
      // Create channel message
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'searchable channel only' });

      const res = await request(app)
        .get('/search?q=searchable&type=messages')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.results.forEach((result: any) => {
        expect(result.type).toBe('message');
      });
    });
  });

  describe('Messages with File Attachments', () => {
    const testFilePath = path.join(process.cwd(), 'test-message-file.txt');

    beforeAll(() => {
      fs.writeFileSync(testFilePath, 'Test file content for message attachment');
    });

    afterAll(() => {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should create message with fileIds array', async () => {
      // Upload a file first
      const uploadRes = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const fileId = uploadRes.body.id;

      // Create message with fileIds
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message with attachment', fileIds: [fileId] });

      expect(res.status).toBe(201);
      expect(res.body.files).toHaveLength(1);
      expect(res.body.files[0].id).toBe(fileId);
    });

    it('should attach multiple files to a message', async () => {
      // Upload multiple files
      const upload1 = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const upload2 = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const fileIds = [upload1.body.id, upload2.body.id];

      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message with multiple attachments', fileIds });

      expect(res.status).toBe(201);
      expect(res.body.files).toHaveLength(2);
    });

    it('should reject invalid fileIds', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message with invalid file', fileIds: [99999] });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid|file/i);
    });

    it('should only attach files owned by the user', async () => {
      // Upload file as user 1
      const uploadRes = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const fileId = uploadRes.body.id;

      // Create user 2
      const user2Res = await request(app).post('/auth/register').send({
        email: 'fileowner@example.com',
        password: 'password123',
        name: 'File Owner Test',
      });

      // User 2 creates channel and tries to use user 1's file
      const channel2Res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ name: 'user2-channel' });

      const res = await request(app)
        .post(`/channels/${channel2Res.body.id}/messages`)
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ content: 'Trying to steal file', fileIds: [fileId] });

      expect(res.status).toBe(400);
    });

    it('should reject already-attached files', async () => {
      // Upload and attach file to first message
      const uploadRes = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const fileId = uploadRes.body.id;

      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'First message', fileIds: [fileId] });

      // Try to attach same file to another message
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Second message', fileIds: [fileId] });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid|attached/i);
    });

    it('should create message without fileIds (backward compat)', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Message without files' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Message without files');
    });
  });
});
