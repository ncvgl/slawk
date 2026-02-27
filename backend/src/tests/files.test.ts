import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../app.js';
import prisma from '../db.js';

describe('File Uploads', () => {
  let authToken: string;
  let channelId: number;
  let messageId: number;

  const testUser = {
    email: 'file-test@example.com',
    password: 'password123',
    name: 'File Test User',
  };

  // Create a test file
  const testFilePath = path.join(process.cwd(), 'test-file.txt');

  beforeAll(() => {
    fs.writeFileSync(testFilePath, 'This is a test file content');
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    // Clean up uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(uploadsDir, file));
      });
    }
  });

  beforeEach(async () => {
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    const userRes = await request(app).post('/auth/register').send(testUser);
    authToken = userRes.body.token;

    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'test-channel' });
    channelId = channelRes.body.id;

    const messageRes = await request(app)
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Test message for files' });
    messageId = messageRes.body.id;
  });

  describe('POST /files', () => {
    it('should upload a file', async () => {
      const res = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      expect(res.status).toBe(201);
      expect(res.body.originalName).toBe('test-file.txt');
      expect(res.body.mimetype).toBe('text/plain');
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('size');
      expect(res.body).toHaveProperty('filename');
    });

    it('should upload file with message association', async () => {
      const res = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .field('messageId', messageId.toString())
        .attach('file', testFilePath);

      expect(res.status).toBe(201);
      expect(res.body.messageId).toBe(messageId);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/files')
        .attach('file', testFilePath);

      expect(res.status).toBe(401);
    });

    it('should return error when no file is provided', async () => {
      const res = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file uploaded');
    });
  });

  describe('GET /files/:id', () => {
    let fileId: number;

    beforeEach(async () => {
      const uploadRes = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);
      fileId = uploadRes.body.id;
    });

    it('should get file info', async () => {
      const res = await request(app)
        .get(`/files/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fileId);
      expect(res.body.originalName).toBe('test-file.txt');
    });

    it('should return 404 for non-existent file', async () => {
      const res = await request(app)
        .get('/files/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /files/:id', () => {
    let fileId: number;

    beforeEach(async () => {
      const uploadRes = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);
      fileId = uploadRes.body.id;
    });

    it('should delete own file', async () => {
      const res = await request(app)
        .delete(`/files/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('File deleted');

      // Verify file is deleted
      const getRes = await request(app)
        .get(`/files/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getRes.status).toBe(404);
    });

    it('should not delete another user file', async () => {
      const user2Res = await request(app).post('/auth/register').send({
        email: 'user2@example.com',
        password: 'password123',
        name: 'User 2',
      });

      const res = await request(app)
        .delete(`/files/${fileId}`)
        .set('Authorization', `Bearer ${user2Res.body.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /files', () => {
    beforeEach(async () => {
      await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);
    });

    it('should list user files', async () => {
      const res = await request(app)
        .get('/files')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
