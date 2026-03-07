import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types.js';
import { parseIntParam } from '../utils/params.js';
import { logError } from '../utils/logger.js';
import { isUserOnline } from '../websocket/index.js';

// Avatar upload setup
const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, crypto.randomUUID() + ext);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100)
    .refine(val => !val.includes('\u0000'), { message: 'Name cannot contain null bytes' })
    .optional(),
  avatar: z.string().max(500).refine(
    (url) => url.startsWith('https://') || url.startsWith('/users/me/avatar/'),
    { message: 'Avatar URL must use HTTPS or be a local avatar path' }
  ).optional().nullable(),
  status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
  bio: z.string().max(500)
    .refine(val => !val.includes('\u0000'), { message: 'Bio cannot contain null bytes' })
    .optional().nullable(),
});

// GET /users/me - Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            messages: true,
            channels: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logError('Get profile error', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PATCH /users/me - Update current user profile
router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const updates = updateProfileSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Update profile error', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /users/me/avatar - Upload avatar image
router.post('/me/avatar', authMiddleware, avatarUpload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No image uploaded' });
      return;
    }

    // Validate magic bytes
    const { fileTypeFromFile } = await import('file-type');
    const detectedType = await fileTypeFromFile(file.path);
    const allowedImageMimes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    if (!detectedType || !allowedImageMimes.has(detectedType.mime)) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'File is not a valid image' });
      return;
    }

    // Process image: resize to 512x512 (client already handles cropping)
    const outputFilename = crypto.randomUUID() + '.png';
    const outputPath = path.join(uploadDir, outputFilename);

    await sharp(file.path, { limitInputPixels: 4096 * 4096 })
      .resize(512, 512, { fit: 'cover' })
      .png()
      .toFile(outputPath);

    // Delete the original upload
    fs.unlinkSync(file.path);

    // Delete old avatar file if it's a local upload
    const oldUser = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } });
    if (oldUser?.avatar?.startsWith('/users/me/avatar/')) {
      const oldFilename = oldUser.avatar.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '');
      if (oldFilename) {
        const oldPath = path.resolve(uploadDir, oldFilename);
        if (oldPath.startsWith(uploadDir) && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    const avatarUrl = `/users/me/avatar/${outputFilename}`;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true, email: true, name: true, avatar: true,
        status: true, bio: true, createdAt: true, updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    logError('Avatar upload error', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// GET /users/me/avatar/:filename - Serve avatar image
router.get('/me/avatar/:filename', async (req: AuthRequest, res: Response) => {
  const filename = (req.params.filename as string).replace(/[^a-zA-Z0-9._-]/g, '');
  const filePath = path.resolve(uploadDir, filename);
  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Avatar not found' });
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    logError('Avatar stream error', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to read avatar' });
  });
  stream.pipe(res);
});

// GET /users/:id - Get user by ID
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseIntParam(req.params.id);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logError('Get user error', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// GET /users - List users (for searching/mentioning)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const rawSearch = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined;
    const search = rawSearch || undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const where = search
      ? {
          name: { contains: search, mode: 'insensitive' as const },
        }
      : {};

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        avatar: true,
        status: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    // Augment with real-time WebSocket presence
    const augmented = users.map((u) => ({
      ...u,
      status: isUserOnline(u.id) ? 'online' : u.status,
      isOnline: isUserOnline(u.id),
    }));

    res.json(augmented);
  } catch (error) {
    logError('List users error', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// PUT /users/me/status - Update user status
router.put('/me/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { status } = z.object({
      status: z.enum(['online', 'away', 'busy', 'offline']),
    }).parse(req.body);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        status: true,
      },
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Update status error', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// GET /users/:id/presence - Get user presence status
router.get('/:id/presence', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseIntParam(req.params.id);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        lastSeen: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check real-time online status from WebSocket connections
    const isOnline = isUserOnline(userId);

    res.json({
      userId: user.id,
      status: isOnline ? 'online' : user.status,
      lastSeen: user.lastSeen,
      isOnline,
    });
  } catch (error) {
    logError('Get presence error', error);
    res.status(500).json({ error: 'Failed to get presence' });
  }
});

export default router;
