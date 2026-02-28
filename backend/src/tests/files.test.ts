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
    await prisma.channelRead.deleteMany();
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

  describe('File Upload - Edge Cases', () => {
    it('should reject files over 10MB', async () => {
      // Create a large file path
      const largeFilePath = path.join(process.cwd(), 'large-test-file.bin');

      // Create 11MB buffer
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');
      fs.writeFileSync(largeFilePath, largeBuffer);

      try {
        const res = await request(app)
          .post('/files')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', largeFilePath);

        // Multer returns 500 for file too large errors
        expect([400, 413, 500]).toContain(res.status);
      } finally {
        // Clean up
        if (fs.existsSync(largeFilePath)) {
          fs.unlinkSync(largeFilePath);
        }
      }
    });

    it('should reject invalid file types', async () => {
      const exeFilePath = path.join(process.cwd(), 'test-malware.exe');
      fs.writeFileSync(exeFilePath, 'fake executable content');

      try {
        const res = await request(app)
          .post('/files')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', exeFilePath);

        // Should be rejected
        expect([400, 500]).toContain(res.status);
      } finally {
        if (fs.existsSync(exeFilePath)) {
          fs.unlinkSync(exeFilePath);
        }
      }
    });

    it('should accept valid image types', async () => {
      // Create a minimal valid PNG file (1x1 transparent pixel)
      const pngFilePath = path.join(process.cwd(), 'test-image.png');
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      fs.writeFileSync(pngFilePath, pngBuffer);

      try {
        const res = await request(app)
          .post('/files')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', pngFilePath);

        expect(res.status).toBe(201);
        expect(res.body.mimetype).toBe('image/png');
      } finally {
        if (fs.existsSync(pngFilePath)) {
          fs.unlinkSync(pngFilePath);
        }
      }
    });

    it('should accept JSON files', async () => {
      const jsonFilePath = path.join(process.cwd(), 'test-data.json');
      fs.writeFileSync(jsonFilePath, JSON.stringify({ test: 'data' }));

      try {
        const res = await request(app)
          .post('/files')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', jsonFilePath);

        expect(res.status).toBe(201);
        expect(res.body.mimetype).toBe('application/json');
      } finally {
        if (fs.existsSync(jsonFilePath)) {
          fs.unlinkSync(jsonFilePath);
        }
      }
    });

    it('should return invalid file ID error', async () => {
      const res = await request(app)
        .get('/files/invalid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid/i);
    });

    it('should reject upload to non-member channel message', async () => {
      // Create user2 with their own channel
      const user2Res = await request(app).post('/auth/register').send({
        email: 'fileuser2@example.com',
        password: 'password123',
        name: 'File User 2',
      });

      const channel2Res = await request(app)
        .post('/channels')
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ name: 'user2-private-channel' });

      const message2Res = await request(app)
        .post(`/channels/${channel2Res.body.id}/messages`)
        .set('Authorization', `Bearer ${user2Res.body.token}`)
        .send({ content: 'User 2 message' });

      // User 1 tries to upload to user 2's message
      const res = await request(app)
        .post('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .field('messageId', message2Res.body.id.toString())
        .attach('file', testFilePath);

      expect(res.status).toBe(403);
    });
  });
});
