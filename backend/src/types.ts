import { Request } from 'express';

export interface JwtPayload {
  userId: number;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
  channelId?: number;
  message?: any;
  file?: any;
}
