import { Router } from 'express';
import { differenceInCalendarDays, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';

export const statsRouter = Router();
statsRouter.use(requireAuth);

// GET /api/stats/summary — main screen dashboard data
statsRouter.get('/summary', async (req, res) => {
  const { companyId, id: userId, role } = req.user!;
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  // 1. Active trip for current user (with running total vs budget)
  const activeTrip = await prisma.trip.findFirst({
    where: { companyId, userId, status: 'ACTIVE' },
    include: { expenses: { select: { amount: true } } },
  });

  let activeTripSummary = null;
  if (activeTrip) {
    const runningTotal = activeTrip.expenses.reduce(
      (sum, e) => sum + parseFloat(e.amount.toString()), 0
    );
    const budget = activeTrip.budget != null ? parseFloat(activeTrip.budget.toString()) : null;
    activeTripSummary = {
      id: activeTrip.id,
      destination: activeTrip.destination,
      startDate: activeTrip.startDate,
      runningTotal: parseFloat(runningTotal.toFixed(2)),
      budget,
      budgetRemaining: budget != null ? parseFloat((budget - runningTotal).toFixed(2)) : null,
    };
  }

  // 2. Current month expenses by category (scoped by role)
  const expenseWhere = role === 'EMPLOYEE'
    ? { companyId, userId, date: { gte: monthStart, lte: monthEnd } }
    : { companyId, date: { gte: monthStart, lte: monthEnd } };

  const monthExpenses = await prisma.expense.findMany({
    where: expenseWhere,
    select: { category: true, amount: true },
  });

  const byCategory: Record<string, number> = {};
  let monthTotal = 0;
  for (const e of monthExpenses) {
    const amt = parseFloat(e.amount.toString());
    byCategory[e.category] = parseFloat(((byCategory[e.category] ?? 0) + amt).toFixed(2));
    monthTotal += amt;
  }

  // 3. Fleet documents expiring in next 30 days (ADMIN/MANAGER/ACCOUNTANT see all; EMPLOYEE sees assigned car)
  const carWhere = role === 'EMPLOYEE'
    ? { companyId, assignedUserId: userId }
    : { companyId };

  const cars = await prisma.car.findMany({
    where: carWhere,
    select: { id: true, make: true, model: true, plateNumber: true },
  });
  const carIds = cars.map((c) => c.id);

  const expiringReminders = carIds.length > 0
    ? await prisma.reminder.findMany({
        where: {
          carId: { in: carIds },
          expiresAt: { lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000) },
          status: { in: ['ACTIVE', 'DUE_SOON'] },
        },
        include: { car: { select: { make: true, model: true, plateNumber: true } } },
        orderBy: { expiresAt: 'asc' },
      })
    : [];

  const expiringDocuments = expiringReminders.map((r) => ({
    reminderId: r.id,
    title: r.title,
    category: r.category,
    expiresAt: r.expiresAt,
    daysLeft: differenceInCalendarDays(startOfDay(r.expiresAt), today),
    car: { make: r.car.make, model: r.car.model, plateNumber: r.car.plateNumber },
  }));

  res.json({
    activeTrip: activeTripSummary,
    currentMonth: {
      label: monthStart.toISOString().slice(0, 7),
      total: parseFloat(monthTotal.toFixed(2)),
      byCategory,
      count: monthExpenses.length,
    },
    expiringDocuments,
  });
});
