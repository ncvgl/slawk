import { TEST_PASSWORD } from './test-constants.js';
import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Authentication', () => {
  const testUser = {
    email: 'test@example.com',
    password: TEST_PASSWORD,
    name: 'Test User',
  };

  beforeEach(async () => {
    await prisma.inviteLink.deleteMany();
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

    it('should not auto-join archived default channels', async () => {
      // Archive the 'general' channel if it exists, or create one and archive it
      let general = await prisma.channel.findFirst({ where: { name: 'general', isPrivate: false } });
      if (!general) {
        general = await prisma.channel.create({ data: { name: 'general', isPrivate: false } });
      }
      await prisma.channel.update({
        where: { id: general.id },
        data: { archivedAt: new Date() },
      });

      // Register a new user
      const res = await request(app).post('/auth/register').send({
        email: 'archived-join@example.com',
        password: 'password123',
        name: 'Archived Join User',
      });
      expect(res.status).toBe(201);

      // Verify user was NOT added to the archived channel
      const membership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: { userId: res.body.user.id, channelId: general.id },
        },
      });
      expect(membership).toBeNull();

      // Cleanup
      await prisma.channel.update({
        where: { id: general.id },
        data: { archivedAt: null },
      });
    });

    it('should not auto-join guests to any channel', async () => {
      // Create a guest invite
      const adminRes = await request(app).post('/auth/register').send({
        email: 'guest-admin@example.com',
        password: 'password123',
        name: 'Guest Admin',
      });
      await prisma.user.update({
        where: { id: adminRes.body.user.id },
        data: { role: 'ADMIN' },
      });
      const adminLoginRes = await request(app).post('/auth/login').send({
        email: 'guest-admin@example.com',
        password: 'password123',
      });

      const inviteRes = await request(app)
        .post('/admin/invites')
        .set('Authorization', `Bearer ${adminLoginRes.body.token}`)
        .send({ role: 'GUEST' });

      // Register as guest
      const guestRes = await request(app).post('/auth/register').send({
        email: 'no-channels-guest@example.com',
        password: 'password123',
        name: 'No Channels Guest',
        inviteCode: inviteRes.body.code,
      });
      expect(guestRes.status).toBe(201);
      expect(guestRes.body.user.role).toBe('GUEST');

      // Guest should have zero channel memberships
      const memberships = await prisma.channelMember.findMany({
        where: { userId: guestRes.body.user.id },
      });
      expect(memberships).toHaveLength(0);
    });

    it('should not register with duplicate email', async () => {
      await request(app).post('/auth/register').send(testUser);

      const res = await request(app)
        .post('/auth/register')
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unable to complete registration');
    });

    it('should return identical error for concurrent duplicate registration (not 500)', async () => {
      // Send two registration requests simultaneously with the same email.
      // Both pass the findUnique check (no user yet), then one succeeds
      // and the other hits the unique constraint (P2002).  The P2002 must
      // return the same 400 + message as the normal duplicate path so
      // attackers can't distinguish "email already existed" from "email
      // just now taken by a racing request".
      const payload = {
        email: 'race@example.com',
        password: 'password123',
        name: 'Race User',
      };

      const [res1, res2] = await Promise.all([
        request(app).post('/auth/register').send(payload),
        request(app).post('/auth/register').send(payload),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // One must succeed (201), the other must be rejected (400) — never 500
      expect(statuses).toEqual([201, 400]);

      // The rejected one must use the same generic message
      const rejected = res1.status === 400 ? res1 : res2;
      expect(rejected.body.error).toBe('Unable to complete registration');
    });

    it('should treat emails as case-insensitive', async () => {
      // Register with lowercase
      await request(app).post('/auth/register').send(testUser);

      // Try to register with uppercase variant — should fail (same email)
      const res = await request(app)
        .post('/auth/register')
        .send({ ...testUser, email: testUser.email.toUpperCase() });

      expect(res.status).toBe(400);
    });

    it('should allow login with different email casing', async () => {
      await request(app).post('/auth/register').send(testUser);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email.toUpperCase(), password: testUser.password });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
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
        .send({ email: 'nonexistent@example.com', password: TEST_PASSWORD });

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

  describe('POST /auth/change-password', () => {
    beforeEach(async () => {
      await request(app).post('/auth/register').send(testUser);
    });

    it('should invalidate old token after password change', async () => {
      // Login to get a token
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      const oldToken = loginRes.body.token;

      // Change password
      const changeRes = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ currentPassword: testUser.password, newPassword: 'newpassword123' });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body).toHaveProperty('token');
      const newToken = changeRes.body.token;

      // Old token should be rejected (tokenVersion mismatch)
      const oldTokenRes = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(oldTokenRes.status).toBe(401);

      // New token should work
      const newTokenRes = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${newToken}`);
      expect(newTokenRes.status).toBe(200);
    });
  });

  describe('Auth error message uniformity', () => {
    it('should return the same error for revoked and deactivated tokens', async () => {
      // Register and get token
      const regRes = await request(app).post('/auth/register').send(testUser);
      const token = regRes.body.token;

      // Revoke by changing password (increments tokenVersion)
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: testUser.password, newPassword: 'changed123' });

      // Revoked token
      const revokedRes = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`);

      // Register a second user and deactivate them
      const user2Res = await request(app).post('/auth/register').send({
        email: 'deact-error@example.com',
        password: 'password123',
        name: 'Deact Error User',
      });
      const user2Token = user2Res.body.token;
      await prisma.user.update({
        where: { id: user2Res.body.user.id },
        data: { deactivatedAt: new Date() },
      });

      // Deactivated token
      const deactRes = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${user2Token}`);

      // Both should return 401 with the same generic message
      expect(revokedRes.status).toBe(401);
      expect(deactRes.status).toBe(401);
      expect(revokedRes.body.error).toBe('Invalid token');
      expect(deactRes.body.error).toBe('Invalid token');
      // Same message — attacker can't distinguish the reason
      expect(revokedRes.body.error).toBe(deactRes.body.error);
    });
  });

  describe('Password change brute-force protection', () => {
    let token: string;

    beforeEach(async () => {
      const regRes = await request(app).post('/auth/register').send(testUser);
      token = regRes.body.token;
    });

    it('should lock out after 5 consecutive wrong current-password attempts', async () => {
      // Make 5 wrong guesses
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/auth/change-password')
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword: `wrong-${i}`, newPassword: 'newpass123' });
        expect(res.status).toBe(401);
      }

      // 6th attempt should be locked out (429), even with the correct password
      const lockedRes = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: testUser.password, newPassword: 'newpass123' });
      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error).toMatch(/too many/i);
    });

    it('should clear lockout counter on successful password change', async () => {
      // Make 4 wrong guesses (below lockout threshold)
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/auth/change-password')
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword: `wrong-${i}`, newPassword: 'newpass123' });
      }

      // Succeed on the 5th attempt
      const successRes = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: testUser.password, newPassword: 'newpass123' });
      expect(successRes.status).toBe(200);
      const newToken = successRes.body.token;

      // Counter should be cleared — 4 more wrong guesses should NOT trigger lockout
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/auth/change-password')
          .set('Authorization', `Bearer ${newToken}`)
          .send({ currentPassword: `wrong-${i}`, newPassword: 'anotherpass123' });
        expect(res.status).toBe(401); // rejected but not locked
      }
    });
  });
});
