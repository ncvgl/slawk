import express from 'express';
import cors from 'cors';
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
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use(errorHandler);

export default app;
