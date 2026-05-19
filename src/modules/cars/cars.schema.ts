import { z } from 'zod';

const carBody = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  plateNumber: z.string().min(1),
  vin: z.string().optional(),
  mileage: z.coerce.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
  color: z.string().optional()
});

export const createCarSchema = z.object({ body: carBody });
export const updateCarSchema = z.object({ body: carBody.partial(), params: z.object({ id: z.string().uuid() }) });
export const carIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
