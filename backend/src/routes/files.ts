import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Storage } from '@google-cloud/storage';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

// GCS setup - only initialize if bucket name is configured
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const gcsStorage = GCS_BUCKET_NAME ? new Storage() : null;
const bucket = gcsStorage && GCS_BUCKET_NAME ? gcsStorage.bucket(GCS_BUCKET_NAME) : null;

const router = Router();

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/json',
      'application/zip',
      'application/x-zip-compressed',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

// Helper to upload to GCS and get signed URL
async function uploadToGCS(localPath: string, filename: string, mimetype: string): Promise<{ gcsPath: string; signedUrl: string }> {
  if (!bucket) throw new Error('GCS not configured');

  const gcsPath = `uploads/${Date.now()}-${filename}`;
  await bucket.upload(localPath, {
    destination: gcsPath,
    metadata: { contentType: mimetype },
  });

  // Generate signed URL valid for 7 days
  const [signedUrl] = await bucket.file(gcsPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  // Delete local temp file after GCS upload
  fs.unlinkSync(localPath);

  return { gcsPath, signedUrl };
}

// POST /files - Upload a file
router.post('/', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const messageId = req.body?.messageId ? parseInt(req.body.messageId) : undefined;

    // If messageId is provided, verify user has access to the channel
    if (messageId) {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        // Delete uploaded file
        fs.unlinkSync(file.path);
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      const membership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: { userId, channelId: message.channelId },
        },
      });

      if (!membership) {
        fs.unlinkSync(file.path);
        res.status(403).json({ error: 'You must be a member of the channel' });
        return;
      }
    }

    let url: string;
    let gcsPath: string | null = null;

    // Upload to GCS if configured, otherwise use local storage
    if (bucket) {
      const gcsResult = await uploadToGCS(file.path, file.originalname, file.mimetype);
      url = gcsResult.signedUrl;
      gcsPath = gcsResult.gcsPath;
    } else {
      url = `/uploads/${file.filename}`;
    }

    const fileRecord = await prisma.file.create({
      data: {
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url,
        gcsPath,
        userId,
        messageId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json(fileRecord);
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /files/:id - Get file info (refreshes signed URL for GCS files)
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);

    if (isNaN(fileId)) {
      res.status(400).json({ error: 'Invalid file ID' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Generate fresh signed URL for GCS files
    if (file.gcsPath && bucket) {
      const [signedUrl] = await bucket.file(file.gcsPath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ ...file, url: signedUrl });
      return;
    }

    res.json(file);
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// DELETE /files/:id - Delete a file
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const userId = req.user!.userId;

    if (isNaN(fileId)) {
      res.status(400).json({ error: 'Invalid file ID' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.userId !== userId) {
      res.status(403).json({ error: 'You can only delete your own files' });
      return;
    }

    // Delete from storage
    if (file.gcsPath && bucket) {
      // Delete from GCS
      try {
        await bucket.file(file.gcsPath).delete();
      } catch (err) {
        console.error('Failed to delete from GCS:', err);
      }
    } else {
      // Delete local file
      const filePath = path.join(uploadDir, file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete database record
    await prisma.file.delete({
      where: { id: fileId },
    });

    res.json({ message: 'File deleted' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// GET /files - List user's files
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const files = await prisma.file.findMany({
      where: { userId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(files);
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

export default router;
