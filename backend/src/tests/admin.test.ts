import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Admin API', () => {
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;

  const adminUser = {
    email: 'admin-test@example.com',
    password: 'password123',
    name: 'Admin User',
  };

  const memberUser = {
    email: 'member-test@example.com',
    password: 'password123',
    name: 'Member User',
  };

  beforeEach(async () => {
    await prisma.inviteLink.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.bookmark.deleteMany();
    await prisma.scheduledMessage.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.directMessage.deleteMany();
    await prisma.user.deleteMany();

    // Register admin
    const adminRes = await request(app).post('/auth/register').send(adminUser);
    adminToken = adminRes.body.token;
    adminId = adminRes.body.user.id;

    // Promote to ADMIN directly
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'ADMIN' },
    });

    // Re-login to get token with correct role check
    const loginRes = await request(app).post('/auth/login').send({
      email: adminUser.email,
      password: adminUser.password,
    });
    adminToken = loginRes.body.token;

    // Register member
    const memberRes = await request(app).post('/auth/register').send(memberUser);
    memberToken = memberRes.body.token;
    memberId = memberRes.body.user.id;
  });

  // ─── Access Control ──────────────────────────────────────────

  describe('Access Control', () => {
    it('should deny unauthenticated requests', async () => {
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(401);
    });

    it('should deny non-admin users', async () => {
      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── User Management ────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('should list all users', async () => {
      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('email');
      expect(res.body[0]).toHaveProperty('role');
      expect(res.body[0]).not.toHaveProperty('password');
    });
  });

  describe('PATCH /admin/users/:id', () => {
    it('should change user role', async () => {
      const res = await request(app)
        .patch(`/admin/users/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'GUEST' });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('GUEST');
    });

    it('should reject modifying own role', async () => {
      const res = await request(app)
        .patch(`/admin/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MEMBER' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot modify your own role');
    });

    it('should reject modifying another admin', async () => {
      // Make member an admin
      await prisma.user.update({
        where: { id: memberId },
        data: { role: 'ADMIN' },
      });

      const res = await request(app)
        .patch(`/admin/users/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MEMBER' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot modify a user with equal or higher role');
    });

    it('should reject invalid role', async () => {
      const res = await request(app)
        .patch(`/admin/users/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'SUPERADMIN' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .patch('/admin/users/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'GUEST' });

      expect(res.status).toBe(404);
    });
  });

  // ─── Deactivation ───────────────────────────────────────────

  describe('POST /admin/users/:id/deactivate', () => {
    it('should deactivate a user', async () => {
      const res = await request(app)
        .post(`/admin/users/${memberId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deactivatedAt).toBeTruthy();
    });

    it('should reject deactivating self', async () => {
      const res = await request(app)
        .post(`/admin/users/${adminId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot deactivate yourself');
    });

    it('should reject deactivating another admin', async () => {
      await prisma.user.update({
        where: { id: memberId },
        data: { role: 'ADMIN' },
      });

      const res = await request(app)
        .post(`/admin/users/${memberId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot deactivate a user with equal or higher role');
    });

    it('should prevent deactivated user from logging in', async () => {
      await request(app)
        .post(`/admin/users/${memberId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: memberUser.email, password: memberUser.password });

      expect(loginRes.status).toBe(401);
    });
  });

  describe('POST /admin/users/:id/reactivate', () => {
    it('should reactivate a deactivated user', async () => {
      // Deactivate first
      await request(app)
        .post(`/admin/users/${memberId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app)
        .post(`/admin/users/${memberId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deactivatedAt).toBeNull();
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .post('/admin/users/99999/reactivate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should NOT allow an ADMIN to reactivate another ADMIN', async () => {
      // Create a second admin
      const admin2Res = await request(app).post('/auth/register').send({
        email: 'admin2-test@example.com',
        password: 'password123',
        name: 'Admin Two',
      });
      const admin2Id = admin2Res.body.user.id;

      // Promote to ADMIN and then deactivate via DB (simulating OWNER action)
      await prisma.user.update({
        where: { id: admin2Id },
        data: { role: 'ADMIN', deactivatedAt: new Date(), tokenVersion: { increment: 1 } },
      });

      // First admin (also ADMIN role) tries to reactivate — should be blocked
      const res = await request(app)
        .post(`/admin/users/${admin2Id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot reactivate a user with equal or higher role');

      // Verify user is still deactivated
      const user = await prisma.user.findUnique({ where: { id: admin2Id } });
      expect(user!.deactivatedAt).not.toBeNull();
    });

    it('should allow OWNER to reactivate an ADMIN', async () => {
      // Promote the admin to OWNER
      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'OWNER' },
      });
      // Re-login as OWNER
      const ownerLoginRes = await request(app).post('/auth/login').send({
        email: adminUser.email,
        password: adminUser.password,
      });
      const ownerToken = ownerLoginRes.body.token;

      // Create and deactivate an admin
      const admin2Res = await request(app).post('/auth/register').send({
        email: 'admin3-test@example.com',
        password: 'password123',
        name: 'Admin Three',
      });
      const admin2Id = admin2Res.body.user.id;
      await prisma.user.update({
        where: { id: admin2Id },
        data: { role: 'ADMIN', deactivatedAt: new Date(), tokenVersion: { increment: 1 } },
      });

      // OWNER reactivates the deactivated admin — should succeed
      const res = await request(app)
        .post(`/admin/users/${admin2Id}/reactivate`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deactivatedAt).toBeNull();
    });
  });

  // ─── Invite Links ──────────────────────────────────────────

  describe('Invite Links', () => {
    describe('POST /admin/invites', () => {
      it('should create an invite link', async () => {
        const res = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'MEMBER' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('code');
        expect(res.body.role).toBe('MEMBER');
        expect(res.body.creator).toHaveProperty('name');
      });

      it('should create a guest invite', async () => {
        const res = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'GUEST' });

        expect(res.status).toBe(201);
        expect(res.body.role).toBe('GUEST');
      });

      it('should reject ADMIN role invite', async () => {
        const res = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'ADMIN' });

        expect(res.status).toBe(400);
      });

      it('should support maxUses and expiresAt', async () => {
        const expiresAt = new Date(Date.now() + 86400000).toISOString();
        const res = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ maxUses: 5, expiresAt });

        expect(res.status).toBe(201);
        expect(res.body.maxUses).toBe(5);
        expect(res.body.expiresAt).toBeTruthy();
      });
    });

    describe('GET /admin/invites', () => {
      it('should list all invites', async () => {
        await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'MEMBER' });

        const res = await request(app)
          .get('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
      });
    });

    describe('DELETE /admin/invites/:id', () => {
      it('should delete an invite', async () => {
        const createRes = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'MEMBER' });

        const res = await request(app)
          .delete(`/admin/invites/${createRes.body.id}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);

        const listRes = await request(app)
          .get('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(listRes.body).toHaveLength(0);
      });
    });

    describe('Invite Registration Flow', () => {
      it('should register with invite code and assign role', async () => {
        const inviteRes = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'GUEST' });

        const code = inviteRes.body.code;

        const regRes = await request(app)
          .post('/auth/register')
          .send({
            email: 'invited@example.com',
            password: 'password123',
            name: 'Invited User',
            inviteCode: code,
          });

        expect(regRes.status).toBe(201);
        expect(regRes.body.user.role).toBe('GUEST');
      });

      it('should validate invite code publicly', async () => {
        const inviteRes = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'MEMBER' });

        const res = await request(app)
          .get(`/auth/invite/${inviteRes.body.code}`);

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
        expect(res.body.role).toBe('MEMBER');
      });

      it('should reject invalid invite code', async () => {
        const res = await request(app)
          .get('/auth/invite/invalidcode123');

        expect(res.status).toBe(404);
      });

      it('should respect maxUses limit', async () => {
        const inviteRes = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'MEMBER', maxUses: 1 });

        const code = inviteRes.body.code;

        // First registration should succeed
        await request(app)
          .post('/auth/register')
          .send({
            email: 'first@example.com',
            password: 'password123',
            name: 'First User',
            inviteCode: code,
          });

        // Second registration should fail
        const regRes = await request(app)
          .post('/auth/register')
          .send({
            email: 'second@example.com',
            password: 'password123',
            name: 'Second User',
            inviteCode: code,
          });

        expect(regRes.status).toBe(400);
      });

      it('should not allow concurrent registrations to exceed maxUses', async () => {
        const inviteRes = await request(app)
          .post('/admin/invites')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'MEMBER', maxUses: 1 });

        const code = inviteRes.body.code;

        // Fire 5 concurrent registration requests with the same invite code
        const results = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            request(app)
              .post('/auth/register')
              .send({
                email: `race-${i}@example.com`,
                password: 'password123',
                name: `Race User ${i}`,
                inviteCode: code,
              })
          )
        );

        const successes = results.filter(r => r.status === 201);
        const failures = results.filter(r => r.status === 400);

        // Exactly 1 should succeed, the rest should fail
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(4);

        // Verify useCount didn't exceed maxUses
        const invite = await prisma.inviteLink.findUnique({ where: { code } });
        expect(invite!.useCount).toBe(1);
      });
    });
  });

  // ─── Channel Management ─────────────────────────────────────

  describe('Channel Management', () => {
    let channelId: number;

    beforeEach(async () => {
      const chRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'admin-test-channel' });
      channelId = chRes.body.id;
    });

    describe('GET /admin/channels', () => {
      it('should list all channels with counts', async () => {
        const res = await request(app)
          .get('/admin/channels')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Find our test channel (there may be auto-created general/random)
        const ch = res.body.find((c: any) => c.name === 'admin-test-channel');
        expect(ch).toBeTruthy();
        expect(ch._count).toHaveProperty('members');
        expect(ch._count).toHaveProperty('messages');
      });
    });

    describe('DELETE /admin/channels/:id', () => {
      it('should delete a channel', async () => {
        const res = await request(app)
          .delete(`/admin/channels/${channelId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);

        const listRes = await request(app)
          .get('/admin/channels')
          .set('Authorization', `Bearer ${adminToken}`);

        const found = listRes.body.find((c: any) => c.id === channelId);
        expect(found).toBeUndefined();
      });
    });

    describe('GET /admin/channels/:id/members', () => {
      it('should list channel members', async () => {
        const res = await request(app)
          .get(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0].user).toHaveProperty('name');
      });
    });

    describe('POST /admin/channels/:id/members', () => {
      it('should add a user to a channel', async () => {
        const res = await request(app)
          .post(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: memberId });

        expect(res.status).toBe(200);

        const membersRes = await request(app)
          .get(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`);

        const found = membersRes.body.find((m: any) => m.user.id === memberId);
        expect(found).toBeTruthy();
      });

      it('should create audit log when adding a member', async () => {
        await request(app)
          .post(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: memberId });

        const logs = await prisma.auditLog.findMany({
          where: { action: 'channel.member_added', targetId: channelId },
          orderBy: { createdAt: 'desc' },
        });
        expect(logs.length).toBeGreaterThanOrEqual(1);
        expect(logs[0].actorId).toBe(adminId);
        expect(logs[0].details).toContain(String(memberId));
      });
    });

    describe('DELETE /admin/channels/:id/members/:userId', () => {
      it('should remove a user from a channel', async () => {
        // Add member first
        await request(app)
          .post(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: memberId });

        const res = await request(app)
          .delete(`/admin/channels/${channelId}/members/${memberId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);

        const membersRes = await request(app)
          .get(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`);

        const found = membersRes.body.find((m: any) => m.user.id === memberId);
        expect(found).toBeUndefined();
      });

      it('should create audit log when removing a member', async () => {
        // Add then remove
        await request(app)
          .post(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: memberId });

        await request(app)
          .delete(`/admin/channels/${channelId}/members/${memberId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        const logs = await prisma.auditLog.findMany({
          where: { action: 'channel.member_removed', targetId: channelId },
          orderBy: { createdAt: 'desc' },
        });
        expect(logs.length).toBeGreaterThanOrEqual(1);
        expect(logs[0].actorId).toBe(adminId);
        expect(logs[0].details).toContain(String(memberId));
      });

      it('should revoke channel access after admin removal', async () => {
        // Make the channel private so non-members are blocked
        await prisma.channel.update({
          where: { id: channelId },
          data: { isPrivate: true },
        });

        // Add member and send a message
        await request(app)
          .post(`/admin/channels/${channelId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: memberId });

        await request(app)
          .post(`/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ content: 'Secret message' });

        // Member can read messages while still a member
        const beforeRes = await request(app)
          .get(`/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${memberToken}`);
        expect(beforeRes.status).toBe(200);
        expect(beforeRes.body.messages).toHaveLength(1);

        // Admin removes the member
        await request(app)
          .delete(`/admin/channels/${channelId}/members/${memberId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        // Removed user can no longer read messages
        const afterRes = await request(app)
          .get(`/channels/${channelId}/messages`)
          .set('Authorization', `Bearer ${memberToken}`);
        expect(afterRes.status).toBe(403);
      });
    });
  });

  // ─── Guest Restrictions ─────────────────────────────────────

  describe('Guest Restrictions', () => {
    let guestToken: string;

    beforeEach(async () => {
      // Create guest invite and register guest
      const inviteRes = await request(app)
        .post('/admin/invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'GUEST' });

      const guestRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'guest@example.com',
          password: 'password123',
          name: 'Guest User',
          inviteCode: inviteRes.body.code,
        });

      guestToken = guestRes.body.token;
    });

    it('should prevent guest from creating channels', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'guest-channel' });

      expect(res.status).toBe(403);
    });

    it('should prevent guest from joining channels', async () => {
      // Create a channel as admin
      const chRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'private-club' });

      const res = await request(app)
        .post(`/channels/${chRes.body.id}/join`)
        .set('Authorization', `Bearer ${guestToken}`);

      expect(res.status).toBe(403);
    });

    it('should prevent guest from accessing admin routes', async () => {
      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${guestToken}`);

      expect(res.status).toBe(403);
    });

    it('should NOT allow transferring ownership to a guest', async () => {
      // Promote admin to OWNER
      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'OWNER' },
      });
      const ownerLoginRes = await request(app).post('/auth/login').send({
        email: adminUser.email,
        password: adminUser.password,
      });
      const ownerToken = ownerLoginRes.body.token;

      // Get the guest user ID
      const guest = await prisma.user.findFirst({ where: { email: 'guest@example.com' } });

      const res = await request(app)
        .post('/admin/transfer-ownership')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: guest!.id });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot transfer ownership to a guest user');

      // Verify roles didn't change
      const ownerAfter = await prisma.user.findUnique({ where: { id: adminId } });
      expect(ownerAfter!.role).toBe('OWNER');
      const guestAfter = await prisma.user.findUnique({ where: { id: guest!.id } });
      expect(guestAfter!.role).toBe('GUEST');
    });
  });
});
