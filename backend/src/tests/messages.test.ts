import request from 'supertest';
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
  });
});
