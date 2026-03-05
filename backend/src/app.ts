import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'blob:', 'https://randomuser.me', 'https://storage.googleapis.com'],
      'connect-src': ["'self'", 'wss:', 'ws:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
const corsOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*');
app.use(cors({ origin: corsOrigin as string | boolean }));
app.use(express.json());

// Note: /uploads is NOT served via express.static to prevent unauthenticated access.
// Files are served through the authenticated GET /files/:id/download endpoint.

// Routes
app.use('/auth', authRoutes);
app.use('/channels', channelRoutes);
app.use('/channels', messageRoutes);
app.use('/messages', threadRoutes);
app.use('/messages', reactionRoutes);
app.use('/search', searchRoutes);
app.use('/files', fileRoutes);
app.use('/users', userRoutes);
app.use('/dms', dmRoutes);
app.use('/messages', bookmarkRoutes);
app.use('/bookmarks', bookmarkRoutes);
app.use('/messages', scheduledMessageRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(process.cwd(), 'public');
  app.use(express.static(frontendDist));
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

export default app;
