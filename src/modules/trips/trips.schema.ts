import { z } from 'zod';

export const createTripSchema = z.object({
  body: z.object({
    destination: z.string().min(1),
    purpose: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    budget: z.coerce.number().positive().optional(),
    carId: z.string().uuid().optional(),
    kmStart: z.coerce.number().int().min(0).optional(),
  }),
});

export const updateTripSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    destination: z.string().min(1).optional(),
    purpose: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    budget: z.coerce.number().positive().optional(),
    carId: z.string().uuid().optional(),
    kmStart: z.coerce.number().int().min(0).optional(),
  }),
});

export const tripIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const closeTripSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    kmEnd: z.coerce.number().int().min(0).optional(),
  }),
});

export const rejectTripSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    reason: z.string().min(1),
  }),
});

export const listTripsSchema = z.object({
  query: z.object({
    status: z.enum(['ACTIVE', 'CLOSED', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
    userId: z.string().uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
