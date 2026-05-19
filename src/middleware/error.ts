import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';

export function notFound(req: Request, _res: Response) {
  throw new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message, code: err.code });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Resource already exists' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Resource not found' });
  }
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
}
