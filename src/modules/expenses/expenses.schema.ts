import { z } from 'zod';

const categoryEnum = z.enum(['COMBUSTIBIL', 'MASA', 'CAZARE', 'TRANSPORT', 'DIURNA', 'ALTELE']);

const expenseBody = z.object({
  tripId: z.string().uuid().optional(),
  category: categoryEnum.default('ALTELE'),
  amount: z.coerce.number().positive(),
  currency: z.string().default('RON'),
  date: z.coerce.date(),
  merchant: z.string().optional(),
  merchantCif: z.string().optional(),
  notes: z.string().optional(),
  imageUrl: z.string().optional(),
  verified: z.boolean().optional(),
});

export const createExpenseSchema = z.object({ body: expenseBody });

export const updateExpenseSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: expenseBody.partial(),
});

export const expenseIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listExpensesSchema = z.object({
  query: z.object({
    tripId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    category: categoryEnum.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
