import { z } from 'zod';

export const tripReportSchema = z.object({
  params: z.object({ tripId: z.string().uuid() }),
});

export const monthlyReportSchema = z.object({
  body: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Format must be YYYY-MM'),
    userId: z.string().uuid().optional(),
  }),
});

export const sendReportSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    to: z.string().email().optional(),
  }),
});

export const reportIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
