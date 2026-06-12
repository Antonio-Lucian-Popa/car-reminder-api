import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

export type UserRole = 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'EMPLOYEE';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError(401, 'Not authenticated');
    if (!roles.includes(req.user.role as UserRole)) {
      throw new AppError(403, 'Insufficient permissions');
    }
    next();
  };
}
