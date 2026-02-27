import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';

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

    const fileRecord = await prisma.file.create({
      data: {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
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

// GET /files/:id - Get file info
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

    // Delete physical file
    const filePath = path.join(uploadDir, path.basename(file.url));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
