import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Channels', () => {
  let authToken: string;
  let userId: number;

  const testUser = {
    email: 'channel-test@example.com',
    password: 'password123',
    name: 'Channel Test User',
  };

  beforeEach(async () => {
    await prisma.message.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    const res = await request(app).post('/auth/register').send(testUser);
    authToken = res.body.token;
    userId = res.body.user.id;
  });

  describe('POST /channels', () => {
    it('should create a new channel', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'general' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('general');
      expect(res.body.isPrivate).toBe(false);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].user.id).toBe(userId);
    });

    it('should create a private channel', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'private-channel', isPrivate: true });

      expect(res.status).toBe(201);
      expect(res.body.isPrivate).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/channels')
        .send({ name: 'general' });

      expect(res.status).toBe(401);
    });

    it('should validate channel name', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /channels', () => {
    beforeEach(async () => {
      await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'general' });

      await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'random' });
    });

    it('should list all channels', async () => {
      const res = await request(app)
        .get('/channels')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/channels');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /channels/:id/join', () => {
    let channelId: number;

    beforeEach(async () => {
      // Create another user and channel
      const user2Res = await request(app).post('/auth/register').send({
        email: 'user2@example.com',
        password: 'password123',
        name: 'User 2',
      });

      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ name: 'other-channel' });

      channelId = channelRes.body.id;
    });

    it('should join a channel', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/join`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Joined channel successfully');
    });

    it('should not join a channel twice', async () => {
      await request(app)
        .post(`/channels/${channelId}/join`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post(`/channels/${channelId}/join`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Already a member of this channel');
    });

    it('should return 404 for non-existent channel', async () => {
      const res = await request(app)
        .post('/channels/99999/join')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /channels/:id/members', () => {
    let channelId: number;

    beforeEach(async () => {
      const channelRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'test-channel' });

      channelId = channelRes.body.id;
    });

    it('should list channel members', async () => {
      const res = await request(app)
        .get(`/channels/${channelId}/members`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].user.email).toBe(testUser.email);
    });
  });
});
