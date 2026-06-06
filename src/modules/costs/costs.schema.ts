import { z } from 'zod';

const category = z.enum(['FUEL','REPAIR','SERVICE','INSURANCE','ROAD_TAX','ROVINIETA','ITP','PARKING','WASHING','PARTS','OTHER']);

const body = z.object({
  carId: z.string().uuid(),
  category,
  amount: z.coerce.number().positive(),
  currency: z.string().default('RON'),
  date: z.coerce.date(),
  mileage: z.coerce.number().int().min(0).optional(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
  receiptImageUrl: z.string().optional(),
});

export const createCostSchema = z.object({ body });
export const updateCostSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: body.omit({ carId: true }).partial(),
});
export const costIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const costListSchema = z.object({ query: z.object({ carId: z.string().uuid().optional() }) });
export const costSummarySchema = z.object({
  query: z.object({
    carId: z.string().uuid().optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
});
