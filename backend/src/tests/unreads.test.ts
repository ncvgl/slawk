import { TEST_PASSWORD } from './test-constants.js';
import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('GET /unreads', () => {
  let user1Token: string;
  let user1Id: number;
  let user2Token: string;
  let user2Id: number;
  let channel1Id: number;
  let channel2Id: number;

  beforeEach(async () => {
    await prisma.directMessage.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    // Create user1
    const user1Res = await request(app).post('/auth/register').send({
      email: 'unreads-user1@example.com',
      password: TEST_PASSWORD,
      name: 'Unreads User 1',
    });
    user1Token = user1Res.body.token;
    user1Id = user1Res.body.user.id;

    // Create user2
    const user2Res = await request(app).post('/auth/register').send({
      email: 'unreads-user2@example.com',
      password: TEST_PASSWORD,
      name: 'Unreads User 2',
    });
    user2Token = user2Res.body.token;
    user2Id = user2Res.body.user.id;

    // Create channel1 and have user2 join
    const channel1Res = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'unreads-channel-1' });
    channel1Id = channel1Res.body.id;

    await request(app)
      .post(`/channels/${channel1Id}/join`)
      .set('Authorization', `Bearer ${user2Token}`);

    // Create channel2 and have user2 join
    const channel2Res = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'unreads-channel-2' });
    channel2Id = channel2Res.body.id;

    await request(app)
      .post(`/channels/${channel2Id}/join`)
      .set('Authorization', `Bearer ${user2Token}`);
  });

  it('should return empty array when no unread messages', async () => {
    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });

  it('should return unread messages from multiple channels', async () => {
    // user1 sends messages to both channels
    await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message in channel 1' });

    await request(app)
      .post(`/channels/${channel2Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message in channel 2' });

    // user2 fetches unreads
    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].content).toBe('Message in channel 2');
    expect(res.body.messages[1].content).toBe('Message in channel 1');
    expect(res.body.messages[0].channel.name).toBe('unreads-channel-2');
    expect(res.body.messages[1].channel.name).toBe('unreads-channel-1');
  });

  it('should not return messages after marking as read', async () => {
    // user1 sends message to channel1
    const msgRes = await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Test message' });

    // user2 marks as read
    await request(app)
      .post(`/channels/${channel1Id}/read`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ messageId: msgRes.body.id });

    // user2 fetches unreads
    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  it('should only return unread messages after last read', async () => {
    // user1 sends 3 messages
    const msg1Res = await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message 1' });

    await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message 2' });

    await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message 3' });

    // user2 marks first message as read
    await request(app)
      .post(`/channels/${channel1Id}/read`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ messageId: msg1Res.body.id });

    // user2 fetches unreads
    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].content).toBe('Message 3');
    expect(res.body.messages[1].content).toBe('Message 2');
  });

  it('should not include thread replies in unreads', async () => {
    // user1 sends parent message
    const parentRes = await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Parent message' });

    // user1 sends thread reply
    await request(app)
      .post(`/messages/${parentRes.body.id}/reply`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Thread reply' });

    // user2 fetches unreads - should only see parent, not reply
    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].content).toBe('Parent message');
  });

  it('should not include deleted messages in unreads', async () => {
    // user1 sends message
    const msgRes = await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Will be deleted' });

    // user1 deletes the message
    await request(app)
      .delete(`/messages/${msgRes.body.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    // user2 fetches unreads
    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  it('should include message user and channel info', async () => {
    await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Test message' });

    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].user).toBeDefined();
    expect(res.body.messages[0].user.name).toBe('Unreads User 1');
    expect(res.body.messages[0].channel).toBeDefined();
    expect(res.body.messages[0].channel.name).toBe('unreads-channel-1');
  });

  it('should support pagination with limit', async () => {
    // user1 sends 5 messages
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`/channels/${channel1Id}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: `Message ${i + 1}` });
    }

    // user2 fetches unreads with limit=3
    const res = await request(app)
      .get('/unreads?limit=3')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(3);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toBeDefined();
  });

  it('should support cursor-based pagination', async () => {
    // user1 sends 5 messages
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`/channels/${channel1Id}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: `Message ${i + 1}` });
    }

    // Fetch first page
    const page1Res = await request(app)
      .get('/unreads?limit=3')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.messages).toHaveLength(3);
    expect(page1Res.body.hasMore).toBe(true);

    // Fetch second page
    const page2Res = await request(app)
      .get(`/unreads?limit=3&cursor=${page1Res.body.nextCursor}`)
      .set('Authorization', `Bearer ${user2Token}`);

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.messages).toHaveLength(2);
    expect(page2Res.body.hasMore).toBe(false);
  });

  it('should only return unreads from channels user is member of', async () => {
    // Create channel3 that user2 is not a member of
    const channel3Res = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'unreads-channel-3' });
    const channel3Id = channel3Res.body.id;

    // user1 sends message to channel3
    await request(app)
      .post(`/channels/${channel3Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Not a member' });

    // user1 sends message to channel1 (user2 is a member)
    await request(app)
      .post(`/channels/${channel1Id}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Is a member' });

    // user2 fetches unreads
    const res = await request(app)
      .get('/unreads')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].content).toBe('Is a member');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/unreads');

    expect(res.status).toBe(401);
  });
});
