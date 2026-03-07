import { Request } from 'express';

export interface JwtPayload {
  userId: number;
  tokenVersion?: number;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
  channelId?: number;
  // These use `any` because `file` conflicts with Express/multer's Request.file type.
  // The middleware (authorize.ts) attaches Prisma model instances at runtime.
  isChannelMember?: boolean;
  message?: any;
  file?: any;
  dm?: any;
}
