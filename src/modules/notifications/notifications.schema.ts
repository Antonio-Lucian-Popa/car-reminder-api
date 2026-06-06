import { z } from 'zod';

export const subscribeSchema = z.object({
  body: z.object({
    type: z.enum(['WEB_PUSH','EXPO_PUSH']),
    platform: z.enum(['WEB','IOS','ANDROID']),
    endpoint: z.string().optional(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
    expoPushToken: z.string().optional(),
    userAgent: z.string().optional()
  }).superRefine((value, ctx) => {
    if (value.type === 'WEB_PUSH' && (!value.endpoint || !value.keys)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'WEB_PUSH requires endpoint and keys' });
    }
    if (value.type === 'EXPO_PUSH' && !value.expoPushToken) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'EXPO_PUSH requires expoPushToken' });
    }
  })
});

export const unsubscribeSchema = z.object({
  body: z.object({ endpoint: z.string().optional(), expoPushToken: z.string().optional() })
    .refine((value) => Boolean(value.endpoint || value.expoPushToken), 'endpoint or expoPushToken is required')
});

export const expoTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    platform: z.enum(['ios', 'android']).optional(),
  }),
});
