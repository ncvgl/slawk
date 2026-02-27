import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Direct Messages', () => {
  let aliceToken: string;
  let bobToken: string;
  let aliceId: number;
  let bobId: number;

  const alice = {
    email: 'alice-dm@example.com',
    password: 'password123',
    name: 'Alice DM',
  };

  const bob = {
    email: 'bob-dm@example.com',
    password: 'password123',
    name: 'Bob DM',
  };

  beforeEach(async () => {
    await prisma.directMessage.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    const aliceRes = await request(app).post('/auth/register').send(alice);
    aliceToken = aliceRes.body.token;
    aliceId = aliceRes.body.user.id;

    const bobRes = await request(app).post('/auth/register').send(bob);
    bobToken = bobRes.body.token;
    bobId = bobRes.body.user.id;
  });

  describe('POST /dms', () => {
    it('should send a DM to another user', async () => {
      const res = await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: bobId, content: 'Hey Bob!' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Hey Bob!');
      expect(res.body.fromUserId).toBe(aliceId);
      expect(res.body.toUserId).toBe(bobId);
      expect(res.body.fromUser.name).toBe('Alice DM');
      expect(res.body.toUser.name).toBe('Bob DM');
    });

    it('should not allow sending DM to yourself', async () => {
      const res = await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: aliceId, content: 'Hello me!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot send DM to yourself');
    });

    it('should return 404 for non-existent recipient', async () => {
      const res = await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: 99999, content: 'Hello?' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Recipient not found');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/dms')
        .send({ toUserId: bobId, content: 'Hello' });

      expect(res.status).toBe(401);
    });

    it('should validate message content', async () => {
      const res = await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: bobId, content: '' });

      expect(res.status).toBe(400);
    });

    it('should validate toUserId', async () => {
      const res = await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: 'invalid', content: 'Hello' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /dms/:userId', () => {
    beforeEach(async () => {
      // Alice sends messages to Bob
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: bobId, content: 'Hey Bob!' });

      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: bobId, content: 'How are you?' });

      // Bob replies
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ toUserId: aliceId, content: 'Hi Alice!' });
    });

    it('should get DM conversation with a user', async () => {
      const res = await request(app)
        .get(`/dms/${bobId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Bob DM');
      expect(res.body.messages).toHaveLength(3);
      expect(res.body.hasMore).toBe(false);
    });

    it('should paginate DM conversation', async () => {
      const res = await request(app)
        .get(`/dms/${bobId}?limit=2`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.nextCursor).toBeDefined();
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get('/dms/99999')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(404);
    });

    it('should mark messages as read when viewing conversation', async () => {
      // Bob has 2 unread messages from Alice
      // When Bob views the conversation, they should be marked as read
      await request(app)
        .get(`/dms/${aliceId}`)
        .set('Authorization', `Bearer ${bobToken}`);

      // Check that Alice's messages to Bob are now read
      const unreadCount = await prisma.directMessage.count({
        where: {
          fromUserId: aliceId,
          toUserId: bobId,
          readAt: null,
        },
      });

      expect(unreadCount).toBe(0);
    });
  });

  describe('GET /dms', () => {
    beforeEach(async () => {
      // Create a third user
      const charlieRes = await request(app).post('/auth/register').send({
        email: 'charlie-dm@example.com',
        password: 'password123',
        name: 'Charlie DM',
      });
      const charlieToken = charlieRes.body.token;
      const charlieId = charlieRes.body.user.id;

      // Alice sends to Bob
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: bobId, content: 'Hey Bob!' });

      // Bob replies to Alice
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ toUserId: aliceId, content: 'Hi Alice!' });

      // Charlie sends to Alice
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${charlieToken}`)
        .send({ toUserId: aliceId, content: 'Hey Alice from Charlie!' });
    });

    it('should list all DM conversations', async () => {
      const res = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2); // Bob and Charlie
    });

    it('should include last message', async () => {
      const res = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      res.body.forEach((convo: any) => {
        expect(convo.lastMessage).toBeDefined();
        expect(convo.lastMessage.content).toBeDefined();
      });
    });

    it('should include unread count', async () => {
      const res = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      res.body.forEach((convo: any) => {
        expect(typeof convo.unreadCount).toBe('number');
      });

      // Alice has unread messages from Bob (1) and Charlie (1)
      const totalUnread = res.body.reduce((sum: number, c: any) => sum + c.unreadCount, 0);
      expect(totalUnread).toBe(2);
    });

    it('should sort by last message date (most recent first)', async () => {
      const res = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(1);

      // Verify sorted by createdAt descending
      for (let i = 0; i < res.body.length - 1; i++) {
        const current = new Date(res.body[i].lastMessage.createdAt).getTime();
        const next = new Date(res.body[i + 1].lastMessage.createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('POST /dms/:userId/read', () => {
    beforeEach(async () => {
      // Bob sends multiple messages to Alice
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ toUserId: aliceId, content: 'Message 1' });

      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ toUserId: aliceId, content: 'Message 2' });

      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ toUserId: aliceId, content: 'Message 3' });
    });

    it('should mark all messages from a user as read', async () => {
      // Verify messages are unread
      let unreadBefore = await prisma.directMessage.count({
        where: {
          fromUserId: bobId,
          toUserId: aliceId,
          readAt: null,
        },
      });
      expect(unreadBefore).toBe(3);

      // Mark as read
      const res = await request(app)
        .post(`/dms/${bobId}/read`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.markedAsRead).toBe(3);

      // Verify messages are read
      const unreadAfter = await prisma.directMessage.count({
        where: {
          fromUserId: bobId,
          toUserId: aliceId,
          readAt: null,
        },
      });
      expect(unreadAfter).toBe(0);
    });

    it('should return 0 if no unread messages', async () => {
      // Mark as read first
      await request(app)
        .post(`/dms/${bobId}/read`)
        .set('Authorization', `Bearer ${aliceToken}`);

      // Try again
      const res = await request(app)
        .post(`/dms/${bobId}/read`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.markedAsRead).toBe(0);
    });

    it('should update unread count in conversation list', async () => {
      // Check unread before
      let convos = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      const bobConvoBefore = convos.body.find((c: any) => c.user.id === bobId);
      expect(bobConvoBefore.unreadCount).toBe(3);

      // Mark as read
      await request(app)
        .post(`/dms/${bobId}/read`)
        .set('Authorization', `Bearer ${aliceToken}`);

      // Check unread after
      convos = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      const bobConvoAfter = convos.body.find((c: any) => c.user.id === bobId);
      expect(bobConvoAfter.unreadCount).toBe(0);
    });
  });

  describe('Unread count edge cases', () => {
    it('should not count sent messages as unread', async () => {
      // Alice sends to Bob
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ toUserId: bobId, content: 'Hello!' });

      // Alice should have 0 unread (she sent it)
      const res = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      const bobConvo = res.body.find((c: any) => c.user.id === bobId);
      expect(bobConvo.unreadCount).toBe(0);
    });

    it('should count received messages as unread', async () => {
      // Bob sends to Alice
      await request(app)
        .post('/dms')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ toUserId: aliceId, content: 'Hello!' });

      // Alice should have 1 unread
      const res = await request(app)
        .get('/dms')
        .set('Authorization', `Bearer ${aliceToken}`);

      const bobConvo = res.body.find((c: any) => c.user.id === bobId);
      expect(bobConvo.unreadCount).toBe(1);
    });
  });
});
