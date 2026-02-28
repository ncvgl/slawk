import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Authentication', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
  };

  beforeEach(async () => {
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.name).toBe(testUser.name);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should not register with duplicate email', async () => {
      await request(app).post('/auth/register').send(testUser);

      const res = await request(app)
        .post('/auth/register')
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email already registered');
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ ...testUser, email: 'invalid-email' });

      expect(res.status).toBe(400);
    });

    it('should require minimum password length', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ ...testUser, password: '12345' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/auth/register').send(testUser);
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body).toHaveProperty('token');
    });

    it('should not login with wrong password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should not login with non-existent email', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });
});
