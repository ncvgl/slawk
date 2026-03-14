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
      expect(res.body.user).not.toHaveProperty('email');
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
      expect(res.body.error).toBe('Unable to complete registration');
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

    it('should not reveal whether an email exists via timing', async () => {
      // Non-existent user should take a similar time to an existing user
      // (both must run bcrypt). We verify the non-existent path takes at
      // least 50ms, proving a dummy bcrypt compare runs.
      const start = Date.now();
      await request(app)
        .post('/auth/login')
        .send({ email: 'nobody-here@example.com', password: 'password123' });
      const elapsed = Date.now() - start;

      // bcrypt typically takes 50-300ms; without the dummy hash it would be <10ms
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('should not reveal deactivated status via timing', async () => {
      // Deactivate the user
      const user = await prisma.user.findUnique({ where: { email: testUser.email } });
      await prisma.user.update({
        where: { id: user!.id },
        data: { deactivatedAt: new Date() },
      });

      // Deactivated user login should still run bcrypt (not return early)
      const start = Date.now();
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      const elapsed = Date.now() - start;

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
      // Must take bcrypt time, proving we didn't short-circuit before compare
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });
});
