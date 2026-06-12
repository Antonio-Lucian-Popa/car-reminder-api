import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import sharp from 'sharp';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import { env } from '../../config/env';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseIdSchema,
  listExpensesSchema,
} from './expenses.schema';

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'receipts');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|webp|heic)/;
    cb(null, allowed.test(file.mimetype));
  },
});

function serializeExpense(e: { amount: Prisma.Decimal; [key: string]: unknown }) {
  return { ...e, amount: parseFloat(e.amount.toString()) };
}

function expenseWhere(user: { id: string; companyId: string; role: string }): Prisma.ExpenseWhereInput {
  if (user.role === 'EMPLOYEE') return { companyId: user.companyId, userId: user.id };
  return { companyId: user.companyId };
}

// POST /api/expenses/upload must be before /:id routes
expensesRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError(400, 'File is required');

  const inputPath = req.file.path;
  const ext = path.extname(req.file.filename);
  const baseName = path.basename(req.file.filename, ext);
  const outFilename = `${baseName}-resized.jpg`;
  const outPath = path.join(UPLOAD_DIR, outFilename);

  await sharp(inputPath)
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(outPath);

  if (inputPath !== outPath) fs.unlink(inputPath, () => {/* best-effort */});

  const publicUrl = env.PUBLIC_URL.replace(/\/$/, '');
  res.json({ imageUrl: `${publicUrl}/api/uploads/receipts/${outFilename}` });
});

expensesRouter.get('/', validate(listExpensesSchema), async (req, res) => {
  const { tripId, userId, category, from, to } = req.query as {
    tripId?: string; userId?: string; category?: string; from?: Date; to?: Date;
  };

  const where: Prisma.ExpenseWhereInput = { ...expenseWhere(req.user!) };
  if (tripId) where.tripId = tripId;
  if (userId && req.user!.role !== 'EMPLOYEE') where.userId = userId;
  if (category) where.category = category as Prisma.EnumExpenseCategoryFilter;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.date as Prisma.DateTimeFilter).lte = new Date(to);
  }

  const expenses = await prisma.expense.findMany({ where, orderBy: { date: 'desc' } });
  res.json(expenses.map(serializeExpense));
});

expensesRouter.post('/', validate(createExpenseSchema), async (req, res) => {
  let { tripId } = req.body as { tripId?: string };

  if (!tripId) {
    const activeTrip = await prisma.trip.findFirst({
      where: { companyId: req.user!.companyId, userId: req.user!.id, status: 'ACTIVE' },
    });
    if (activeTrip) tripId = activeTrip.id;
  } else {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, companyId: req.user!.companyId },
    });
    if (!trip) throw new AppError(404, 'Trip not found');
  }

  const expense = await prisma.expense.create({
    data: { ...req.body, tripId: tripId ?? null, companyId: req.user!.companyId, userId: req.user!.id },
  });
  res.status(201).json(serializeExpense(expense));
});

expensesRouter.get('/:id', validate(expenseIdSchema), async (req, res) => {
  const expense = await prisma.expense.findFirst({
    where: { id: String(req.params.id), ...expenseWhere(req.user!) },
  });
  if (!expense) throw new AppError(404, 'Expense not found');
  res.json(serializeExpense(expense));
});

expensesRouter.patch('/:id', validate(updateExpenseSchema), async (req, res) => {
  const existing = await prisma.expense.findFirst({
    where: { id: String(req.params.id), ...expenseWhere(req.user!) },
  });
  if (!existing) throw new AppError(404, 'Expense not found');
  const expense = await prisma.expense.update({ where: { id: existing.id }, data: req.body });
  res.json(serializeExpense(expense));
});

expensesRouter.delete('/:id', validate(expenseIdSchema), async (req, res) => {
  const existing = await prisma.expense.findFirst({
    where: { id: String(req.params.id), ...expenseWhere(req.user!) },
  });
  if (!existing) throw new AppError(404, 'Expense not found');
  await prisma.expense.delete({ where: { id: existing.id } });
  res.status(204).send();
});
