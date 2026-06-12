import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import { env } from '../../config/env';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, firstName: true, lastName: true, companyId: true, role: true, isActive: true, createdAt: true }
  });
  res.json(user);
});

const inviteSchema = z.object({
  body: z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.enum(['MANAGER', 'ACCOUNTANT', 'EMPLOYEE']).default('EMPLOYEE')
  })
});

usersRouter.post('/invite', requireAuth, requireRole('ADMIN', 'MANAGER'), validate(inviteSchema), async (req, res) => {
  const { email, firstName, lastName, role } = req.body as { email: string; firstName?: string; lastName?: string; role: 'MANAGER' | 'ACCOUNTANT' | 'EMPLOYEE' };
  const companyId = req.user!.companyId;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new AppError(409, 'Email already registered');

  const temporaryPassword = randomBytes(8).toString('hex');
  const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, firstName, lastName, companyId, role }
  });

  res.status(201).json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId },
    temporaryPassword
  });
});

usersRouter.get('/', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.user!.companyId },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  res.json(users);
});
