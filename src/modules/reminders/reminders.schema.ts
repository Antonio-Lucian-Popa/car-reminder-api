import { z } from 'zod';

const category = z.enum(['ITP','RCA','CASCO','ROVINIETA','REVIZIE','SCHIMB_ULEI','SCHIMB_ANVELOPE','TAXE','CUSTOM']);
const repeat = z.enum(['NONE','MONTHLY','YEARLY','CUSTOM']);

const body = z.object({
  title: z.string().min(1),
  category: category.default('CUSTOM'),
  expiresAt: z.coerce.date(),
  notifyBeforeDays: z.coerce.number().int().min(0).default(7),
  repeat: repeat.default('NONE'),
  customRepeatDays: z.coerce.number().int().min(1).optional(),
  notes: z.string().optional()
});

export const createReminderSchema = z.object({ params: z.object({ carId: z.string().uuid() }), body });
export const updateReminderSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: body.partial() });
export const reminderIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const renewReminderSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ expiresAt: z.coerce.date(), notes: z.string().optional() }) });
