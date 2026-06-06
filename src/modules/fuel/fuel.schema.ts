import { z } from 'zod';

const fuelKind = z.enum(['benzina','motorina','gpl','electric','hybrid']);

const body = z.object({
  carId: z.string().uuid(),
  date: z.coerce.date(),
  station: z.string().optional(),
  fuelType: fuelKind,
  liters: z.coerce.number().positive(),
  pricePerLiter: z.coerce.number().positive(),
  total: z.coerce.number().positive(),
  mileage: z.coerce.number().int().min(0).optional(),
  fullTank: z.boolean().default(true),
  receiptImageUrl: z.string().optional(),
});

export const createFuelSchema = z.object({ body });
export const updateFuelSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: body.omit({ carId: true }).partial(),
});
export const fuelIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const fuelListSchema = z.object({ query: z.object({ carId: z.string().uuid().optional() }) });
export const fuelAnalyticsSchema = z.object({ query: z.object({ carId: z.string().uuid().optional() }) });
