import { z } from 'zod';

export const subscribeSchema = z.object({
  body: z.object({
    type: z.enum(['WEB_PUSH','EXPO_PUSH']),
    platform: z.enum(['WEB','IOS','ANDROID']),
    endpoint: z.string().optional(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
    expoPushToken: z.string().optional(),
    userAgent: z.string().optional()
  })
});

export const unsubscribeSchema = z.object({
  body: z.object({ endpoint: z.string().optional(), expoPushToken: z.string().optional() })
});
