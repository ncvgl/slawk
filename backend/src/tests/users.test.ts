import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('User Profiles', () => {
  let authToken: string;
  let userId: number;

  const testUser = {
    email: 'profile-test@example.com',
    password: 'password123',
    name: 'Profile Test User',
  };

  beforeEach(async () => {
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
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
      expect(res.body.email).toBe(testUser.email);
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
        password: 'password123',
        name: 'Alice',
      });
      await request(app).post('/auth/register').send({
        email: 'bob@example.com',
        password: 'password123',
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

    it('should search users by email', async () => {
      const res = await request(app)
        .get('/users?search=bob@')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].email).toBe('bob@example.com');
    });
  });
});
