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
import { sendInviteEmail } from '../../lib/mailer';
import { hashToken } from '../../lib/tokens';

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
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new AppError(409, 'Email already registered');

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) throw new AppError(404, 'Company not found');

  const activationToken = randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), env.BCRYPT_SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const invitedUser = await tx.user.create({
      data: { email: normalizedEmail, passwordHash, firstName, lastName, companyId, role, isActive: false }
    });
    await tx.invitationToken.create({
      data: {
        userId: invitedUser.id,
        tokenHash: hashToken(activationToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    return invitedUser;
  });

  const acceptUrl = `${env.PUBLIC_URL.replace(/\/$/, '')}/api/auth/activate-invite?token=${activationToken}`;
  await sendInviteEmail({ to: user.email, companyName: company.name, acceptUrl });

  res.status(201).json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId }
  });
});

usersRouter.get('/', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: {
      companyId: req.user!.companyId,
      OR: [
        { isActive: true },
        { invitationTokens: { some: { usedAt: null, expiresAt: { gt: new Date() } } } }
      ]
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
      invitationTokens: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
        take: 1
      }
    },
    orderBy: { createdAt: 'asc' }
  });
  res.json(users.map(({ invitationTokens, ...user }) => ({
    ...user,
    invitationPending: invitationTokens.length > 0
  })));
});

usersRouter.delete('/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const targetId = String(req.params.id);
  const target = await prisma.user.findFirst({
    where: { id: targetId, companyId: req.user!.companyId }
  });

  if (!target) throw new AppError(404, 'User not found');
  if (target.id === req.user!.id || target.email === req.user!.email) {
    throw new AppError(400, 'You cannot remove your own account');
  }

  if (req.user!.role === 'MANAGER' && (target.role === 'ADMIN' || target.role === 'MANAGER')) {
    throw new AppError(403, 'Managers can only remove employees and accountants');
  }

  const pendingInvitation = await prisma.invitationToken.findFirst({
    where: { userId: target.id, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true }
  });

  if (!target.isActive && pendingInvitation) {
    await prisma.user.delete({ where: { id: target.id } });
    return res.status(204).send();
  }

  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() }
    }),
    prisma.notificationDevice.updateMany({
      where: { userId: target.id },
      data: { isActive: false }
    }),
    prisma.invitationToken.updateMany({
      where: { userId: target.id, usedAt: null },
      data: { usedAt: new Date() }
    }),
    prisma.user.update({
      where: { id: target.id },
      data: { isActive: false }
    })
  ]);

  res.status(204).send();
});
