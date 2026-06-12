import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/tokens';
import { AppError } from '../lib/errors';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Missing authorization token');
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, companyId: payload.companyId, role: payload.role };
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired access token');
  }
}
