import webpush from 'web-push';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export async function sendWebPush(device: { endpoint: string | null; p256dh: string | null; auth: string | null }, payload: unknown) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { skipped: true, reason: 'VAPID keys not configured' };
  if (!device.endpoint || !device.p256dh || !device.auth) return { skipped: true, reason: 'Invalid web push device' };
  const subscription = { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } };
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

export async function sendExpoPush(expoPushToken: string | null, payload: { title: string; body: string; data?: Record<string, unknown> }) {
  if (!expoPushToken) return { skipped: true, reason: 'Missing expo push token' };
  // Placeholder intentionally kept dependency-free. Later replace with Expo SDK or fetch to Expo Push API.
  console.log('Expo push placeholder:', { to: expoPushToken, ...payload });
  return { skipped: true, reason: 'Expo push sender not implemented yet' };
}

export async function notifyUser(userId: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
  const devices = await prisma.notificationDevice.findMany({ where: { userId, isActive: true } });
  const results = [];
  for (const device of devices) {
    try {
      if (device.type === 'WEB_PUSH') results.push(await sendWebPush(device, payload));
      if (device.type === 'EXPO_PUSH') results.push(await sendExpoPush(device.expoPushToken, payload));
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await prisma.notificationDevice.update({ where: { id: device.id }, data: { isActive: false } });
      }
      results.push({ error: error?.message ?? 'Push failed' });
    }
  }
  return results;
}
