import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Edit and Delete Messages', () => {
  let aliceToken: string;
  let bobToken: string;
  let channelId: number;

  const alice = {
    email: 'alice-edit@example.com',
    password: 'password123',
    name: 'Alice Edit',
  };

  const bob = {
    email: 'bob-edit@example.com',
    password: 'password123',
    name: 'Bob Edit',
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

    const bobRes = await request(app).post('/auth/register').send(bob);
    bobToken = bobRes.body.token;

    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'test-channel' });

    channelId = channelRes.body.id;

    // Bob joins the channel
    await request(app)
      .post(`/channels/${channelId}/join`)
      .set('Authorization', `Bearer ${bobToken}`);
  });

  describe('PATCH /messages/:id', () => {
    let messageId: number;

    beforeEach(async () => {
      const msgRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Original message' });

      messageId = msgRes.body.id;
    });

    it('should edit own message', async () => {
      const res = await request(app)
        .patch(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Updated message' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Updated message');
      expect(res.body.id).toBe(messageId);
    });

    it('should update the updatedAt timestamp', async () => {
      const originalMsg = await prisma.message.findUnique({
        where: { id: messageId },
      });

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await request(app)
        .patch(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Updated message' });

      const updatedMsg = await prisma.message.findUnique({
        where: { id: messageId },
      });

      expect(updatedMsg!.updatedAt.getTime()).toBeGreaterThan(
        originalMsg!.updatedAt.getTime()
      );
    });

    it('should not allow editing another user message', async () => {
      const res = await request(app)
        .patch(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ content: 'Hacked!' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You can only edit your own messages');

      // Verify message wasn't changed
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
      });
      expect(msg!.content).toBe('Original message');
    });

    it('should return 404 for non-existent message', async () => {
      const res = await request(app)
        .patch('/messages/99999')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .patch(`/messages/${messageId}`)
        .send({ content: 'Updated' });

      expect(res.status).toBe(401);
    });

    it('should validate content', async () => {
      const res = await request(app)
        .patch(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: '' });

      expect(res.status).toBe(400);
    });

    it('should not allow editing deleted messages', async () => {
      // Delete the message first
      await request(app)
        .delete(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      // Try to edit
      const res = await request(app)
        .patch(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /messages/:id', () => {
    let messageId: number;

    beforeEach(async () => {
      const msgRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Message to delete' });

      messageId = msgRes.body.id;
    });

    it('should soft delete own message', async () => {
      const res = await request(app)
        .delete(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Message deleted successfully');

      // Verify soft delete (message still exists but has deletedAt)
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
      });
      expect(msg).not.toBeNull();
      expect(msg!.deletedAt).not.toBeNull();
    });

    it('should not allow deleting another user message', async () => {
      const res = await request(app)
        .delete(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You can only delete your own messages');

      // Verify message wasn't deleted
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
      });
      expect(msg!.deletedAt).toBeNull();
    });

    it('should return 404 for non-existent message', async () => {
      const res = await request(app)
        .delete('/messages/99999')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).delete(`/messages/${messageId}`);

      expect(res.status).toBe(401);
    });

    it('should return 404 when trying to delete already deleted message', async () => {
      // Delete once
      await request(app)
        .delete(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      // Try to delete again
      const res = await request(app)
        .delete(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(404);
    });

    it('should exclude deleted messages from GET /channels/:id/messages', async () => {
      // Send another message
      await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Another message' });

      // Delete the first message
      await request(app)
        .delete(`/messages/${messageId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      // Get messages
      const res = await request(app)
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].content).toBe('Another message');
    });

    it('should exclude deleted messages from thread replies', async () => {
      // Create a parent message
      const parentRes = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Parent message' });

      const parentId = parentRes.body.id;

      // Create replies
      const reply1Res = await request(app)
        .post(`/messages/${parentId}/reply`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Reply 1' });

      await request(app)
        .post(`/messages/${parentId}/reply`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Reply 2' });

      // Delete first reply
      await request(app)
        .delete(`/messages/${reply1Res.body.id}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      // Get thread
      const res = await request(app)
        .get(`/messages/${parentId}/thread`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.replies).toHaveLength(1);
      expect(res.body.replies[0].content).toBe('Reply 2');
    });
  });
});
