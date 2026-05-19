import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { env } from '../../config/env';
import { hashToken, refreshExpiryDate, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens';

function publicUser(user: { id: string; email: string; firstName: string | null; lastName: string | null; createdAt: Date }) {
  return user;
}

async function issueTokens(user: { id: string; email: string }) {
  const jti = randomUUID();
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  await prisma.refreshToken.create({
    data: { id: jti, userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiryDate() }
  });
  return { accessToken, refreshToken };
}

export async function register(input: { email: string; password: string; firstName?: string; lastName?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new AppError(409, 'Email already registered');
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email.toLowerCase(), passwordHash, firstName: input.firstName, lastName: input.lastName }
  });
  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user) throw new AppError(401, 'Invalid credentials');
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new AppError(401, 'Invalid credentials');
  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload;
  try { payload = verifyRefreshToken(refreshToken); } catch { throw new AppError(401, 'Invalid refresh token'); }
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw new AppError(401, 'Refresh token expired or revoked');
  if (stored.id !== payload.jti || stored.userId !== payload.sub) throw new AppError(401, 'Invalid refresh token');

  const newJti = randomUUID();
  const accessToken = signAccessToken({ sub: stored.user.id, email: stored.user.email });
  const newRefreshToken = signRefreshToken({ sub: stored.user.id, jti: newJti });

  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), replacedBy: newJti } }),
    prisma.refreshToken.create({ data: { id: newJti, userId: stored.user.id, tokenHash: hashToken(newRefreshToken), expiresAt: refreshExpiryDate() } })
  ]);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  return { success: true };
}
