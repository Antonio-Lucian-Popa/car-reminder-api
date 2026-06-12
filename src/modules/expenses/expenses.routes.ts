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
  exportExpensesSchema,
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

// GET /api/expenses/export — must be before /:id routes
expensesRouter.get('/export', validate(exportExpensesSchema), async (req, res) => {
  const { from, to, userId } = req.query as { from?: Date; to?: Date; userId?: string };

  const where: Prisma.ExpenseWhereInput = { ...expenseWhere(req.user!) };
  if (userId && req.user!.role !== 'EMPLOYEE') where.userId = userId;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.date as Prisma.DateTimeFilter).lte = new Date(to);
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { date: 'asc' },
    include: {
      trip: { select: { destination: true } },
    },
  });

  // Fetch user names in one query
  const userIds = [...new Set(expenses.map((e) => e.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const usersMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const escape = (v: string | null | undefined) => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const headers = ['Data', 'Angajat', 'Email', 'Calatorie', 'Categorie', 'Comerciant', 'CIF', 'Suma', 'Moneda', 'Verificat'];
  const rows = expenses.map((e) => {
    const u = usersMap[e.userId];
    const userName = u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : e.userId;
    const userEmail = u?.email ?? '';
    return [
      escape(e.date.toISOString().slice(0, 10)),
      escape(userName),
      escape(userEmail),
      escape(e.trip?.destination ?? ''),
      escape(e.category),
      escape(e.merchant),
      escape(e.merchantCif),
      escape(parseFloat(e.amount.toString()).toFixed(2)),
      escape(e.currency),
      escape(e.verified ? 'Da' : 'Nu'),
    ].join(',');
  });

  // UTF-8 BOM for Excel Romanian compatibility
  const BOM = '﻿';
  const csv = BOM + [headers.join(','), ...rows].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="expenses-export.csv"`);
  res.send(csv);
});

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
  let resolvedTrip: { id: string; carId: string | null } | null = null;

  if (!tripId) {
    const activeTrip = await prisma.trip.findFirst({
      where: { companyId: req.user!.companyId, userId: req.user!.id, status: 'ACTIVE' },
      select: { id: true, carId: true },
    });
    if (activeTrip) { tripId = activeTrip.id; resolvedTrip = activeTrip; }
  } else {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, companyId: req.user!.companyId },
      select: { id: true, carId: true },
    });
    if (!trip) throw new AppError(404, 'Trip not found');
    resolvedTrip = trip;
  }

  const body = req.body as { category: string; amount: string; currency: string; date: Date; merchant?: string; notes?: string };

  const expense = await prisma.expense.create({
    data: { ...req.body, tripId: tripId ?? null, companyId: req.user!.companyId, userId: req.user!.id },
  });

  // When a COMBUSTIBIL expense is linked to a trip that has a car, mirror it as a Cost (FUEL)
  if (body.category === 'COMBUSTIBIL' && resolvedTrip?.carId) {
    await prisma.cost.create({
      data: {
        carId: resolvedTrip.carId,
        category: 'FUEL',
        amount: body.amount,
        currency: body.currency ?? 'RON',
        date: body.date ?? expense.date,
        vendor: body.merchant ?? null,
        notes: body.notes ?? null,
        linkedExpenseId: expense.id,
      },
    });
  }

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
