import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Reactions', () => {
  let authToken: string;
  let channelId: number;
  let messageId: number;

  const testUser = {
    email: 'reaction-test@example.com',
    password: 'password123',
    name: 'Reaction Test User',
  };

  beforeEach(async () => {
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
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

    const messageRes = await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Test message for reactions' });
    messageId = messageRes.body.id;
  });

  describe('POST /messages/:id/reactions', () => {
    it('should add a reaction to a message', async () => {
      const res = await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(201);
      expect(res.body.emoji).toBe('👍');
      expect(res.body.messageId).toBe(messageId);
    });

    it('should not add duplicate reaction', async () => {
      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });

      const res = await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Reaction already exists');
    });

    it('should allow different emojis on same message', async () => {
      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });

      const res = await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '❤️' });

      expect(res.status).toBe(201);
      expect(res.body.emoji).toBe('❤️');
    });

    it('should return 404 for non-existent message', async () => {
      const res = await request(app)
        .post('/messages/99999/reactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(404);
    });

    it('should require channel membership', async () => {
      const user2Res = await request(app).post('/auth/register').send({
        email: 'user2@example.com',
        password: 'password123',
        name: 'User 2',
      });

      const res = await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /messages/:id/reactions/:emoji', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });
    });

    it('should remove a reaction', async () => {
      const res = await request(app)
        .delete(`/messages/${messageId}/reactions/${encodeURIComponent('👍')}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Reaction removed');
    });

    it('should return 404 for non-existent reaction', async () => {
      const res = await request(app)
        .delete(`/messages/${messageId}/reactions/${encodeURIComponent('❤️')}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /messages/:id/reactions', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '👍' });

      await request(app)
        .post(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emoji: '❤️' });
    });

    it('should get all reactions grouped by emoji', async () => {
      const res = await request(app)
        .get(`/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('emoji');
      expect(res.body[0]).toHaveProperty('count');
      expect(res.body[0]).toHaveProperty('users');
    });
  });
});
