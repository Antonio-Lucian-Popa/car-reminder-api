import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import { env } from '../../config/env';
import { generateTripReport, generateMonthlyReport, type ExpenseRow } from '../../lib/pdf';
import { sendReportEmail } from '../../lib/mailer';
import {
  tripReportSchema,
  monthlyReportSchema,
  sendReportSchema,
  reportIdSchema,
} from './reports.schema';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const REPORTS_DIR = path.join(process.cwd(), 'uploads', 'reports');

function toExpenseRow(e: {
  date: Date; category: string; merchant: string | null; merchantCif: string | null;
  amount: { toString(): string }; currency: string; notes: string | null; imageUrl: string | null;
}): ExpenseRow {
  return {
    date: e.date, category: e.category, merchant: e.merchant, merchantCif: e.merchantCif,
    amount: parseFloat(e.amount.toString()), currency: e.currency, notes: e.notes, imageUrl: e.imageUrl,
  };
}

// POST /api/reports/trip/:tripId
reportsRouter.post('/trip/:tripId', validate(tripReportSchema), async (req, res) => {
  const tripId = String(req.params.tripId);

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, companyId: req.user!.companyId },
    include: {
      expenses: { orderBy: { date: 'asc' } },
      company: true,
    },
  });
  if (!trip) throw new AppError(404, 'Trip not found');

  const user = await prisma.user.findUnique({
    where: { id: trip.userId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!user) throw new AppError(404, 'User not found');

  const pdfPath = await generateTripReport(
    {
      company: { name: trip.company.name, cif: trip.company.cif },
      user,
      trip: {
        destination: trip.destination,
        purpose: trip.purpose,
        startDate: trip.startDate,
        endDate: trip.endDate,
        kmStart: trip.kmStart,
        kmEnd: trip.kmEnd,
        budget: trip.budget != null ? parseFloat(trip.budget.toString()) : null,
        status: trip.status,
      },
      expenses: trip.expenses.map(toExpenseRow),
    },
    REPORTS_DIR,
    env.PUBLIC_URL
  );

  const report = await prisma.report.create({
    data: {
      companyId: req.user!.companyId,
      type: 'TRIP',
      tripId,
      userId: req.user!.id,
      pdfPath,
    },
  });

  res.status(201).json(report);
});

// POST /api/reports/monthly
reportsRouter.post('/monthly', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), validate(monthlyReportSchema), async (req, res) => {
  const { month, userId } = req.body as { month: string; userId?: string };

  const [year, m] = month.split('-').map(Number);
  const from = new Date(year, m - 1, 1);
  const to = new Date(year, m, 1);

  const expenseWhere: { companyId: string; date: { gte: Date; lt: Date }; userId?: string } = {
    companyId: req.user!.companyId,
    date: { gte: from, lt: to },
  };
  if (userId) expenseWhere.userId = userId;

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
    orderBy: [{ date: 'asc' }],
  });

  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } });
  if (!company) throw new AppError(404, 'Company not found');

  let userInfo: { firstName: string | null; lastName: string | null; email: string } | null = null;
  if (userId) {
    userInfo = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
  }

  const pdfPath = await generateMonthlyReport(
    {
      company: { name: company.name, cif: company.cif },
      month,
      user: userInfo,
      expenses: expenses.map(toExpenseRow),
    },
    REPORTS_DIR,
    env.PUBLIC_URL
  );

  const report = await prisma.report.create({
    data: {
      companyId: req.user!.companyId,
      type: 'MONTHLY',
      month,
      userId: req.user!.id,
      pdfPath,
    },
  });

  res.status(201).json(report);
});

// GET /api/reports
reportsRouter.get('/', async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(reports);
});

// GET /api/reports/:id/download
reportsRouter.get('/:id/download', validate(reportIdSchema), async (req, res) => {
  const report = await prisma.report.findFirst({
    where: { id: String(req.params.id), companyId: req.user!.companyId },
  });
  if (!report) throw new AppError(404, 'Report not found');
  if (!fs.existsSync(report.pdfPath)) throw new AppError(404, 'PDF file not found on disk');

  const filename = path.basename(report.pdfPath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(report.pdfPath).pipe(res);
});

// DELETE /api/reports/:id
reportsRouter.delete('/:id', validate(reportIdSchema), async (req, res) => {
  const report = await prisma.report.findFirst({
    where: { id: String(req.params.id), companyId: req.user!.companyId },
  });
  if (!report) throw new AppError(404, 'Report not found');
  if (fs.existsSync(report.pdfPath)) fs.unlinkSync(report.pdfPath);
  await prisma.report.delete({ where: { id: report.id } });
  res.status(204).end();
});

// POST /api/reports/:id/send
reportsRouter.post('/:id/send', validate(sendReportSchema), async (req, res) => {
  const report = await prisma.report.findFirst({
    where: { id: String(req.params.id), companyId: req.user!.companyId },
    include: { company: true },
  });
  if (!report) throw new AppError(404, 'Report not found');
  if (!fs.existsSync(report.pdfPath)) throw new AppError(404, 'PDF file not found on disk');

  const to: string = (req.body as { to?: string }).to ?? report.company.accountantEmail ?? '';
  if (!to) throw new AppError(400, 'No recipient email address (provide "to" or set accountantEmail on company)');

  const label = report.type === 'TRIP' ? `delegație` : `lunar ${report.month}`;
  await sendReportEmail({
    to,
    subject: `Raport ${label} — ${report.company.name}`,
    body: `Bună ziua,\n\nAtașat găsiți raportul ${label} pentru ${report.company.name}.\n\nMultumim.`,
    pdfPath: report.pdfPath,
    pdfFilename: path.basename(report.pdfPath),
  });

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: { sentTo: to, sentAt: new Date() },
  });
  res.json(updated);
});
