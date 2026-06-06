import { z } from 'zod';

const docType = z.enum(['RCA','CASCO','ITP','ROVINIETA','INVOICE','FUEL_RECEIPT','SERVICE_RECEIPT','OTHER']);

export const createDocumentSchema = z.object({
  body: z.object({
    carId: z.string().uuid(),
    type: docType,
    title: z.string().min(1),
    linkedCostId: z.string().uuid().optional(),
    linkedReminderId: z.string().uuid().optional(),
  }),
});

export const docListSchema = z.object({ query: z.object({ carId: z.string().uuid().optional() }) });
export const docIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
