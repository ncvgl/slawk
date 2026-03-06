import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Storage } from '@google-cloud/storage';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireFileAccess } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { JWT_SECRET } from '../config.js';

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
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
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
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/mp4;codecs=opus',
      'audio/aac',
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

    // Validate actual file content via magic bytes, not just client Content-Type
    const { fileTypeFromFile } = await import('file-type');
    const detectedType = await fileTypeFromFile(file.path);
    const allowedMimesByMagic = new Set([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/zip',
      'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm',
      'video/webm', // file-type detects WebM container as video/webm
    ]);
    // Text/JSON files have no magic bytes — allow if client claimed text/plain or application/json
    const textTypes = new Set(['text/plain', 'application/json']);
    if (detectedType) {
      if (!allowedMimesByMagic.has(detectedType.mime)) {
        fs.unlinkSync(file.path);
        res.status(400).json({ error: 'File content does not match an allowed type' });
        return;
      }
      // Override client-provided mimetype with detected one,
      // but keep audio/webm when client claims audio in a WebM container
      // (file-type detects all WebM as video/webm even for audio-only)
      if (detectedType.mime === 'video/webm' && file.mimetype === 'audio/webm') {
        // keep client's audio/webm
      } else {
        file.mimetype = detectedType.mime;
      }
    } else if (!textTypes.has(file.mimetype)) {
      // No magic bytes detected and not a text type — reject
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'File content does not match an allowed type' });
      return;
    }

    const rawMessageId = req.body?.messageId ? parseInt(req.body.messageId) : undefined;
    if (rawMessageId !== undefined && isNaN(rawMessageId)) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'Invalid messageId' });
      return;
    }
    const messageId = rawMessageId;

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
      try {
        const gcsResult = await uploadToGCS(file.path, file.originalname, file.mimetype);
        url = gcsResult.signedUrl;
        gcsPath = gcsResult.gcsPath;
      } catch (gcsError) {
        console.error('GCS upload failed:', gcsError);
        // Clean up local temp file
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        const detail = gcsError instanceof Error ? gcsError.message : String(gcsError);
        res.status(502).json({ error: `File storage unavailable: ${detail}` });
        return;
      }
    } else {
      // URL will be updated after creation to use authenticated download endpoint
      url = '';
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

    // For local files, set URL to authenticated download endpoint
    if (!gcsPath) {
      await prisma.file.update({
        where: { id: fileRecord.id },
        data: { url: `/files/${fileRecord.id}/download` },
      });
      fileRecord.url = `/files/${fileRecord.id}/download`;
    }

    res.status(201).json(fileRecord);
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /files/:id - Get file info (refreshes signed URL for GCS files)
router.get('/:id', authMiddleware, requireFileAccess, async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;

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

// POST /files/download-token - Issue a short-lived download token (not per-file)
router.post('/download-token', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const downloadToken = jwt.sign(
      { userId: req.user!.userId, email: req.user!.email, purpose: 'file-download' },
      JWT_SECRET,
      { expiresIn: '5m' },
    );
    res.json({ token: downloadToken });
  } catch (error) {
    console.error('Generate download token error:', error);
    res.status(500).json({ error: 'Failed to generate download token' });
  }
});

// GET /files/:id/download - Download file content (authenticated via header, or scoped download token)
router.get('/:id/download', (req: AuthRequest, res: Response, next) => {
  // Accept scoped download token via query parameter for <img>/<a> tags
  if (!req.headers.authorization && req.query.token) {
    try {
      const payload = jwt.verify(req.query.token as string, JWT_SECRET) as any;
      if (payload.purpose !== 'file-download') {
        res.status(403).json({ error: 'Invalid download token' });
        return;
      }
      // Set auth header so authMiddleware succeeds
      req.headers.authorization = `Bearer ${req.query.token}`;
    } catch {
      res.status(401).json({ error: 'Invalid or expired download token' });
      return;
    }
  }
  next();
}, authMiddleware, requireFileAccess, async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;

    // GCS files: redirect to signed URL
    if (file.gcsPath && bucket) {
      const safeName = file.originalName.replace(/["\\\r\n]/g, '_');
      const signedUrlOpts: any = {
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 min
      };
      if (req.query.dl === '1') {
        signedUrlOpts.responseDisposition = `attachment; filename="${safeName}"`;
      }
      const [signedUrl] = await bucket.file(file.gcsPath).getSignedUrl(signedUrlOpts);
      res.redirect(signedUrl);
      return;
    }

    // Local files: stream from disk
    const filePath = path.join(uploadDir, file.filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', file.size);
    // Sanitize filename to prevent header injection
    const safeName = file.originalName.replace(/["\\\r\n]/g, '_');
    const disposition = req.query.dl === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
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
