import { TEST_PASSWORD } from './test-constants.js';
import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('User Profiles', () => {
  let authToken: string;
  let userId: number;

  const testUser = {
    email: 'profile-test@example.com',
    password: TEST_PASSWORD,
    name: 'Profile Test User',
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
    userId = userRes.body.user.id;
  });

  describe('GET /users/me', () => {
    it('should get current user profile', async () => {
      const res = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(testUser.email);
      expect(res.body.name).toBe(testUser.name);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('_count');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/users/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /users/me', () => {
    it('should update user name', async () => {
      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    });

    it('should update user bio', async () => {
      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ bio: 'This is my bio' });

      expect(res.status).toBe(200);
      expect(res.body.bio).toBe('This is my bio');
    });

    it('should update user avatar', async () => {
      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ avatar: 'https://example.com/avatar.png' });

      expect(res.status).toBe(200);
      expect(res.body.avatar).toBe('https://example.com/avatar.png');
    });

    it('should validate avatar URL', async () => {
      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ avatar: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('should validate status values', async () => {
      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid-status' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /users/me/status', () => {
    it('should update user status', async () => {
      const res = await request(app)
        .put('/users/me/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'away' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('away');
    });

    it('should accept valid status values', async () => {
      const statuses = ['online', 'away', 'busy', 'offline'];

      for (const status of statuses) {
        const res = await request(app)
          .put('/users/me/status')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ status });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(status);
      }
    });
  });

  describe('GET /users/:id', () => {
    it('should get user by ID', async () => {
      const res = await request(app)
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userId);
      expect(res.body.name).toBe(testUser.name);
    });

    it('should NOT expose email when viewing another user profile', async () => {
      // Create a second user
      const otherRes = await request(app).post('/auth/register').send({
        email: 'other-user@example.com',
        password: 'password123',
        name: 'Other User',
      });
      const otherUserId = otherRes.body.user.id;

      // View the other user's profile
      const res = await request(app)
        .get(`/users/${otherUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(otherUserId);
      expect(res.body.name).toBe('Other User');
      expect(res.body).not.toHaveProperty('email');
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get('/users/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /users', () => {
    beforeEach(async () => {
      await request(app).post('/auth/register').send({
        email: 'alice@example.com',
        password: TEST_PASSWORD,
        name: 'Alice',
      });
      await request(app).post('/auth/register').send({
        email: 'bob@example.com',
        password: TEST_PASSWORD,
        name: 'Bob',
      });
    });

    it('should list all users', async () => {
      const res = await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });

    it('should search users by name', async () => {
      const res = await request(app)
        .get('/users?search=Alice')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Alice');
    });

    it('should not search users by email (privacy)', async () => {
      const res = await request(app)
        .get('/users?search=bob@')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('@mention search should not match user by email prefix (privacy leak)', async () => {
      // "alice" appears in alice@example.com but should NOT return that user
      // unless their name also contains "alice"
      const res = await request(app)
        .get('/users?search=alice')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Only the user whose NAME contains "alice" should be returned
      expect(res.body.every((u: { name: string }) => u.name.toLowerCase().includes('alice'))).toBe(true);
      // The "Profile Test User" whose email is profile-test@example.com should not appear
      const profileTestUser = res.body.find((u: { name: string }) => u.name === 'Profile Test User');
      expect(profileTestUser).toBeUndefined();
    });

    it('should NOT return deactivated users in search results', async () => {
      // Deactivate Alice
      const alice = await prisma.user.findFirst({ where: { name: 'Alice' } });
      await prisma.user.update({
        where: { id: alice!.id },
        data: { deactivatedAt: new Date() },
      });

      // Search for Alice — should not appear
      const res = await request(app)
        .get('/users?search=Alice')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.find((u: { name: string }) => u.name === 'Alice')).toBeUndefined();
    });

    it('should NOT return deactivated users in full listing', async () => {
      // Get count before deactivation
      const beforeRes = await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${authToken}`);
      const countBefore = beforeRes.body.length;

      // Deactivate Bob
      const bob = await prisma.user.findFirst({ where: { name: 'Bob' } });
      await prisma.user.update({
        where: { id: bob!.id },
        data: { deactivatedAt: new Date() },
      });

      const afterRes = await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${authToken}`);

      expect(afterRes.body.length).toBe(countBefore - 1);
      expect(afterRes.body.find((u: { name: string }) => u.name === 'Bob')).toBeUndefined();
    });
  });
});
