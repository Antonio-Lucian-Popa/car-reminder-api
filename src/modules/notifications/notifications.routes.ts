import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { subscribeSchema, unsubscribeSchema, expoTokenSchema } from './notifications.schema';
import { env } from '../../config/env';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY });
});

notificationsRouter.post('/subscribe', validate(subscribeSchema), async (req, res) => {
  const { type, platform, endpoint, keys, expoPushToken, userAgent } = req.body;
  const device = await prisma.notificationDevice.upsert({
    where: type === 'WEB_PUSH'
      ? { userId_endpoint: { userId: req.user!.id, endpoint } }
      : { userId_expoPushToken: { userId: req.user!.id, expoPushToken } },
    update: { platform, p256dh: keys?.p256dh, auth: keys?.auth, userAgent, isActive: true },
    create: { userId: req.user!.id, type, platform, endpoint, p256dh: keys?.p256dh, auth: keys?.auth, expoPushToken, userAgent }
  });
  res.status(201).json(device);
});

notificationsRouter.post('/unsubscribe', validate(unsubscribeSchema), async (req, res) => {
  const { endpoint, expoPushToken } = req.body;
  await prisma.notificationDevice.updateMany({
    where: { userId: req.user!.id, OR: [{ endpoint }, { expoPushToken }] },
    data: { isActive: false }
  });
  res.json({ success: true });
});

// Simplified Expo Push Token endpoints for mobile app
notificationsRouter.post('/expo-token', validate(expoTokenSchema), async (req, res) => {
  const { token, platform } = req.body as { token: string; platform?: 'ios' | 'android' };
  const devicePlatform = platform ? (platform.toUpperCase() as 'IOS' | 'ANDROID') : 'ANDROID';
  await prisma.notificationDevice.upsert({
    where: { userId_expoPushToken: { userId: req.user!.id, expoPushToken: token } },
    update: { isActive: true, platform: devicePlatform },
    create: { userId: req.user!.id, type: 'EXPO_PUSH', platform: devicePlatform, expoPushToken: token },
  });
  res.status(204).send();
});

notificationsRouter.delete('/expo-token', validate(expoTokenSchema), async (req, res) => {
  const { token } = req.body as { token: string };
  await prisma.notificationDevice.updateMany({
    where: { userId: req.user!.id, expoPushToken: token },
    data: { isActive: false },
  });
  res.status(204).send();
});
