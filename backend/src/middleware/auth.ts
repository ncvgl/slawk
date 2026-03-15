import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JwtPayload } from '../types.js';
import { JWT_SECRET } from '../config.js';
import prisma from '../db.js';

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload & { purpose?: string };
    // Reject scoped tokens (e.g. file-download) from being used as general auth
    if (decoded.purpose) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Validate tokenVersion against DB to support server-side revocation.
    // All failures return the same generic message to prevent
    // authentication state enumeration (OWASP).
    if (decoded.tokenVersion === undefined) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { tokenVersion: true, role: true, deactivatedAt: true },
    });
    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (user.deactivatedAt) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.user = { ...decoded, role: user.role };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
