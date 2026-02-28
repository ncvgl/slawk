import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Channel Unread Counts', () => {
  let user1Token: string;
  let user2Token: string;
  let user2Id: number;
  let channelId: number;

  beforeEach(async () => {
    await prisma.directMessage.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    // Create user1 who owns the channel
    const user1Res = await request(app).post('/auth/register').send({
      email: 'unread-user1@example.com',
      password: 'password123',
      name: 'Unread User 1',
    });
    user1Token = user1Res.body.token;

    // Create user2
    const user2Res = await request(app).post('/auth/register').send({
      email: 'unread-user2@example.com',
      password: 'password123',
      name: 'Unread User 2',
    });
    user2Token = user2Res.body.token;
    user2Id = user2Res.body.user.id;

    // user1 creates a channel
    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'unread-test' });
    channelId = channelRes.body.id;

    // user2 joins the channel
    await request(app)
      .post(`/channels/${channelId}/join`)
      .set('Authorization', `Bearer ${user2Token}`);
  });

  it('should show unreadCount: 0 when no new messages', async () => {
    const res = await request(app)
      .get('/channels')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    const channel = res.body.find((c: any) => c.id === channelId);
    expect(channel.unreadCount).toBe(0);
  });

  it('should count unread messages after other user sends messages', async () => {
    // user1 sends 3 messages
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: `Message ${i + 1}` });
    }

    // user2 checks channels — should see 3 unread
    const res = await request(app)
      .get('/channels')
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(200);
    const channel = res.body.find((c: any) => c.id === channelId);
    expect(channel.unreadCount).toBe(3);
  });

  it('should reset unread count after marking as read', async () => {
    // user1 sends 3 messages
    const messageIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const msgRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: `Message ${i + 1}` });
      messageIds.push(msgRes.body.id);
    }

    // user2 marks as read up to the latest message
    const readRes = await request(app)
      .post(`/channels/${channelId}/read`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ messageId: messageIds[2] });

    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);

    // user2 checks channels — should see 0 unread
    const res = await request(app)
      .get('/channels')
      .set('Authorization', `Bearer ${user2Token}`);

    const channel = res.body.find((c: any) => c.id === channelId);
    expect(channel.unreadCount).toBe(0);
  });

  it('should show partial unread after reading some messages', async () => {
    // user1 sends 5 messages
    const messageIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const msgRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: `Message ${i + 1}` });
      messageIds.push(msgRes.body.id);
    }

    // user2 reads up to message 3
    await request(app)
      .post(`/channels/${channelId}/read`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ messageId: messageIds[2] });

    // user2 checks channels — should see 2 unread
    const res = await request(app)
      .get('/channels')
      .set('Authorization', `Bearer ${user2Token}`);

    const channel = res.body.find((c: any) => c.id === channelId);
    expect(channel.unreadCount).toBe(2);
  });

  it('should require membership to mark as read', async () => {
    // Create a third user who is not a member
    const user3Res = await request(app).post('/auth/register').send({
      email: 'unread-user3@example.com',
      password: 'password123',
      name: 'Unread User 3',
    });

    const msgRes = await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Test' });

    const res = await request(app)
      .post(`/channels/${channelId}/read`)
      .set('Authorization', `Bearer ${user3Res.body.token}`)
      .send({ messageId: msgRes.body.id });

    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent message', async () => {
    const res = await request(app)
      .post(`/channels/${channelId}/read`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ messageId: 99999 });

    expect(res.status).toBe(404);
  });

  it('should validate messageId in request body', async () => {
    const res = await request(app)
      .post(`/channels/${channelId}/read`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('should not count thread replies as unread', async () => {
    // user1 sends a parent message
    const parentRes = await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Parent message' });

    // user1 sends a reply (threadId set)
    await request(app)
      .post(`/messages/${parentRes.body.id}/reply`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Thread reply' });

    // user2 should only see 1 unread (the parent, not the reply)
    const res = await request(app)
      .get('/channels')
      .set('Authorization', `Bearer ${user2Token}`);

    const channel = res.body.find((c: any) => c.id === channelId);
    expect(channel.unreadCount).toBe(1);
  });
});

describe('Thread Reply Counts', () => {
  let authToken: string;
  let channelId: number;

  beforeEach(async () => {
    await prisma.directMessage.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    const userRes = await request(app).post('/auth/register').send({
      email: 'thread-count@example.com',
      password: 'password123',
      name: 'Thread Count User',
    });
    authToken = userRes.body.token;

    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'thread-count-test' });
    channelId = channelRes.body.id;
  });

  it('should return _count.replies: 0 for messages without replies', async () => {
    await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'No replies here' });

    const res = await request(app)
      .get(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.messages[0]._count.replies).toBe(0);
  });

  it('should return correct reply count for threaded messages', async () => {
    // Create parent message
    const parentRes = await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Parent message' });

    const parentId = parentRes.body.id;

    // Add 3 replies
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/messages/${parentId}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: `Reply ${i + 1}` });
    }

    const res = await request(app)
      .get(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const parent = res.body.messages.find((m: any) => m.id === parentId);
    expect(parent._count.replies).toBe(3);
  });

  it('should not include replies as top-level messages', async () => {
    const parentRes = await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Parent' });

    await request(app)
      .post(`/messages/${parentRes.body.id}/reply`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Reply' });

    const res = await request(app)
      .get(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`);

    // Should only have 1 top-level message, not 2
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].id).toBe(parentRes.body.id);
    expect(res.body.messages[0]._count.replies).toBe(1);
  });

  it('should show reply counts from multiple users', async () => {
    // Create second user
    const user2Res = await request(app).post('/auth/register').send({
      email: 'thread-user2@example.com',
      password: 'password123',
      name: 'Thread User 2',
    });
    const user2Token = user2Res.body.token;

    // user2 joins channel
    await request(app)
      .post(`/channels/${channelId}/join`)
      .set('Authorization', `Bearer ${user2Token}`);

    // user1 creates parent
    const parentRes = await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Discussion topic' });

    // Both users reply
    await request(app)
      .post(`/messages/${parentRes.body.id}/reply`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'User 1 reply' });

    await request(app)
      .post(`/messages/${parentRes.body.id}/reply`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ content: 'User 2 reply' });

    const res = await request(app)
      .get(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`);

    const parent = res.body.messages.find((m: any) => m.id === parentRes.body.id);
    expect(parent._count.replies).toBe(2);
  });
});
