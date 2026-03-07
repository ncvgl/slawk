import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth.js';
import channelRoutes from './routes/channels.js';
import messageRoutes from './routes/messages.js';
import threadRoutes from './routes/threads.js';
import searchRoutes from './routes/search.js';
import reactionRoutes from './routes/reactions.js';
import fileRoutes from './routes/files.js';
import userRoutes from './routes/users.js';
import dmRoutes from './routes/dms.js';
import bookmarkRoutes from './routes/bookmarks.js';
import scheduledMessageRoutes from './routes/scheduled-messages.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();

// Trust first proxy (e.g. Cloud Run, nginx) for correct rate-limit keying
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'blob:', ...(process.env.NODE_ENV !== 'production' ? ['https://randomuser.me'] : []), ...(process.env.GCS_BUCKET_NAME ? [`https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}`] : [])],
      'connect-src': ["'self'", 'wss:', 'ws:'],
      'media-src': ["'self'", 'blob:', 'https://storage.googleapis.com'],
    },
  },
  crossOriginEmbedderPolicy: 'credentialless' as any,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
const corsOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173');
app.use(cors({ origin: corsOrigin as string | boolean }));
app.use(express.json({ limit: '100kb' }));

// Rate limiting (skip in test environment)
const isTest = process.env.NODE_ENV === 'test';

const authLimiter = isTest
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many attempts, please try again later' },
    });

const apiLimiter = isTest
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    });

// Cache-Control: no-store for all API responses
app.use((req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/channels') || req.path.startsWith('/messages') ||
      req.path.startsWith('/files') || req.path.startsWith('/users') || req.path.startsWith('/dms') ||
      req.path.startsWith('/search') || req.path.startsWith('/bookmarks') || req.path.startsWith('/admin')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Note: /uploads is NOT served via express.static to prevent unauthenticated access.
// Files are served through the authenticated GET /files/:id/download endpoint.

// Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/channels', apiLimiter, channelRoutes);
app.use('/channels', apiLimiter, messageRoutes);
app.use('/messages', apiLimiter, threadRoutes);
app.use('/messages', apiLimiter, reactionRoutes);
app.use('/search', apiLimiter, searchRoutes);
app.use('/files', apiLimiter, fileRoutes);
app.use('/users', apiLimiter, userRoutes);
app.use('/dms', apiLimiter, dmRoutes);
app.use('/messages', apiLimiter, bookmarkRoutes);
app.use('/bookmarks', apiLimiter, bookmarkRoutes);
app.use('/messages', apiLimiter, scheduledMessageRoutes);
app.use('/admin', apiLimiter, adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(process.cwd(), 'public');
  app.use(express.static(frontendDist, { dotfiles: 'deny' }));
  app.get('/{*splat}', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

export default app;
