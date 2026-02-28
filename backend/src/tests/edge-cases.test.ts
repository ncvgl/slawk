import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';

describe('Edge Cases & Error Handling', () => {
  let authToken: string;
  let channelId: number;

  const testUser = {
    email: 'edge-test@example.com',
    password: 'password123',
    name: 'Edge Test User',
  };

  beforeEach(async () => {
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    const userRes = await request(app).post('/auth/register').send(testUser);
    authToken = userRes.body.token;

    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'edge-test-channel' });
    channelId = channelRes.body.id;
  });

  describe('Very Long Message', () => {
    it('should handle a very long message (10,000 characters)', async () => {
      const longContent = 'a'.repeat(10000);

      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: longContent });

      // Should either accept or reject gracefully - not crash
      expect([201, 400]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body).toHaveProperty('error');
      }
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should safely handle SQL injection in channel name', async () => {
      const maliciousName = "test'; DROP TABLE users;--";

      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: maliciousName });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(maliciousName);

      // Verify users table still exists
      const usersCount = await prisma.user.count();
      expect(usersCount).toBeGreaterThan(0);
    });

    it('should safely handle SQL injection in message content', async () => {
      const maliciousContent = "'; DELETE FROM messages; --";

      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: maliciousContent });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe(maliciousContent);
    });

    it('should safely handle SQL injection in search query', async () => {
      const maliciousQuery = "'; DROP TABLE messages; --";

      const res = await request(app)
        .get(`/search?q=${encodeURIComponent(maliciousQuery)}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Should return empty array or error, not crash
      expect([200, 400]).toContain(res.status);

      // Verify messages table still exists
      const messagesCount = await prisma.message.count();
      expect(messagesCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Special Characters', () => {
    it('should handle emojis in messages', async () => {
      const emojiContent = '🎉🚀💯 Hello World! 你好世界 🌍';

      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: emojiContent });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe(emojiContent);
    });

    it('should handle special characters in channel name', async () => {
      const specialName = 'test-channel_123.beta';

      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: specialName });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(specialName);
    });

    it('should handle newlines in messages', async () => {
      const multilineContent = 'Line 1\nLine 2\nLine 3';

      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: multilineContent });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe(multilineContent);
    });
  });

  describe('Invalid Input Types', () => {
    it('should reject non-string channel name', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 12345 });

      expect(res.status).toBe(400);
    });

    it('should reject non-string message content', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: { nested: 'object' } });

      expect(res.status).toBe(400);
    });

    it('should reject array as message content', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: ['array', 'content'] });

      expect(res.status).toBe(400);
    });
  });

  describe('Whitespace Handling', () => {
    it('should handle whitespace-only message gracefully', async () => {
      const res = await request(app)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '   \n\t   ' });

      // Application may accept or reject - either is valid behavior
      expect([201, 400]).toContain(res.status);
    });

    it('should handle whitespace-only channel name gracefully', async () => {
      const res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '   ' });

      // Application may accept or reject - either is valid behavior
      expect([201, 400]).toContain(res.status);
    });
  });
});
