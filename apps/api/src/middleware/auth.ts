import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User, type IUser } from '../models/User.js';

export interface AuthRequest extends Request {
  user?: IUser;
  userId?: string;
}

interface AccessPayload {
  sub: string;
  type: 'access';
}

export function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId, type: 'access' }, config.jwtAccessSecret, {
    expiresIn: '15m',
  });
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ sub: userId, type: 'refresh' }, config.jwtRefreshSecret, {
    expiresIn: '30d',
  });
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, config.jwtRefreshSecret) as { sub: string; type: string };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtAccessSecret) as AccessPayload;
    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch {
    return res.status(401).json({ error: 'Token expirado o inválido' });
  }
}
