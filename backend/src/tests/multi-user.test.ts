import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Multi-User Scenarios', () => {
  let aliceToken: string;
  let bobToken: string;
  let charlieToken: string;
  let aliceId: number;
  let bobId: number;
  let charlieId: number;
  let channelId: number;

  beforeEach(async () => {
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    // Register Alice
    const aliceRes = await request(app).post('/auth/register').send({
      email: 'alice@test.com',
      password: 'password123',
      name: 'Alice',
    });
    aliceToken = aliceRes.body.token;
    aliceId = aliceRes.body.user.id;

    // Register Bob
    const bobRes = await request(app).post('/auth/register').send({
      email: 'bob@test.com',
      password: 'password123',
      name: 'Bob',
    });
    bobToken = bobRes.body.token;
    bobId = bobRes.body.user.id;

    // Register Charlie
    const charlieRes = await request(app).post('/auth/register').send({
      email: 'charlie@test.com',
      password: 'password123',
      name: 'Charlie',
    });
    charlieToken = charlieRes.body.token;
    charlieId = charlieRes.body.user.id;

    // Alice creates a channel
    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'general' });
    channelId = channelRes.body.id;

    // Bob joins the channel
    await request(app)
      .post(`/channels/${channelId}/join`)
      .set('Authorization', `Bearer ${bobToken}`);
  });

  describe('Multi-User Messaging', () => {
    it('should send message as different user', async () => {
      // Alice sends a message
      const aliceMessage = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Hello everyone!' });

      expect(aliceMessage.status).toBe(201);
      expect(aliceMessage.body.user.name).toBe('Alice');

      // Bob sends a message
      const bobMessage = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ content: 'Hi Alice!' });

      expect(bobMessage.status).toBe(201);
      expect(bobMessage.body.user.name).toBe('Bob');
    });

    it('should show messages from both users with correct attribution', async () => {
      // Alice sends a message
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Hello everyone!' });

      // Bob sends a message
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ content: 'Hi Alice!' });

      // Get messages and verify both are present with correct user info
      const res = await request(app)
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);

      const userNames = res.body.messages.map((m: any) => m.user.name);
      expect(userNames).toContain('Alice');
      expect(userNames).toContain('Bob');

      // Verify each message has correct user
      const aliceMsg = res.body.messages.find((m: any) => m.content === 'Hello everyone!');
      const bobMsg = res.body.messages.find((m: any) => m.content === 'Hi Alice!');

      expect(aliceMsg.user.name).toBe('Alice');
      expect(bobMsg.user.name).toBe('Bob');
    });

    it('should not allow non-member to send messages', async () => {
      // Charlie tries to send without joining
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${charlieToken}`)
        .send({ content: 'Can I join?' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You must join the channel to send messages');
    });

    it('should allow non-member to send after joining', async () => {
      // Charlie joins
      await request(app)
        .post(`/channels/${channelId}/join`)
        .set('Authorization', `Bearer ${charlieToken}`);

      // Now Charlie can send
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${charlieToken}`)
        .send({ content: 'Hello, I just joined!' });

      expect(res.status).toBe(201);
      expect(res.body.user.name).toBe('Charlie');
    });
  });

  describe('Channel Membership', () => {
    it('should show all members after multiple users join', async () => {
      // Charlie joins
      await request(app)
        .post(`/channels/${channelId}/join`)
        .set('Authorization', `Bearer ${charlieToken}`);

      const res = await request(app)
        .get(`/channels/${channelId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);

      const memberNames = res.body.map((m: any) => m.user.name);
      expect(memberNames).toContain('Alice');
      expect(memberNames).toContain('Bob');
      expect(memberNames).toContain('Charlie');
    });
  });

  describe('Private Channel Access', () => {
    let privateChannelId: number;

    beforeEach(async () => {
      const privateRes = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'private-team', isPrivate: true });
      privateChannelId = privateRes.body.id;
    });

    it('should create private channel with isPrivate=true', async () => {
      const res = await request(app)
        .get('/channels')
        .set('Authorization', `Bearer ${aliceToken}`);

      const privateChannel = res.body.find((c: any) => c.name === 'private-team');
      expect(privateChannel).toBeDefined();
      expect(privateChannel.isPrivate).toBe(true);
    });
  });

  describe('Cross-User Search', () => {
    beforeEach(async () => {
      // Alice sends messages
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Hello from Alice about project alpha' });

      // Bob sends messages
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ content: 'Bob here talking about project beta' });
    });

    it('should find messages from all users in joined channels', async () => {
      const res = await request(app)
        .get('/search?q=project')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
    });

    it('should not find messages from channels user has not joined', async () => {
      // Alice creates another channel
      const channel2Res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'alice-only' });

      await request(app)
        .post(`/channels/${channel2Res.body.id}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Secret project gamma info' });

      // Bob should not see this message
      const res = await request(app)
        .get('/search?q=gamma')
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });
  });
});
