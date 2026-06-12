import { Router } from 'express';
import { differenceInCalendarDays, startOfDay, subYears } from 'date-fns';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';

export const fleetRouter = Router();
fleetRouter.use(requireAuth, requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'));

type DocStatus = 'valid' | 'expires_soon' | 'expired';

function reminderDocStatus(daysLeft: number, notifyBeforeDays: number): DocStatus {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= notifyBeforeDays) return 'expires_soon';
  return 'valid';
}

// GET /api/fleet/overview
fleetRouter.get('/overview', async (req, res) => {
  const companyId = req.user!.companyId;
  const today = startOfDay(new Date());
  const twelveMonthsAgo = subYears(today, 1);

  const cars = await prisma.car.findMany({
    where: { companyId },
    include: {
      reminders: { orderBy: { expiresAt: 'asc' } },
      costs: {
        where: { date: { gte: twelveMonthsAgo } },
        select: { amount: true },
      },
    },
    orderBy: { plateNumber: 'asc' },
  });

  // Fetch assigned users in one query
  const assignedUserIds = cars
    .map((c) => c.assignedUserId)
    .filter((id): id is string => id != null);

  const usersMap = assignedUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: assignedUserIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }).then((users) => Object.fromEntries(users.map((u) => [u.id, u])))
    : {} as Record<string, { id: string; firstName: string | null; lastName: string | null; email: string }>;

  const overview = cars.map((car) => {
    const documents = car.reminders.map((r) => {
      const daysLeft = differenceInCalendarDays(startOfDay(r.expiresAt), today);
      return {
        reminderId: r.id,
        title: r.title,
        category: r.category,
        expiresAt: r.expiresAt,
        daysLeft,
        status: reminderDocStatus(daysLeft, r.notifyBeforeDays),
      };
    });

    const totalCosts12m = car.costs.reduce(
      (sum, c) => sum + parseFloat(c.amount.toString()), 0
    );

    const assignedUser = car.assignedUserId ? usersMap[car.assignedUserId] ?? null : null;

    return {
      id: car.id,
      plateNumber: car.plateNumber,
      make: car.make,
      model: car.model,
      year: car.year,
      mileage: car.mileage,
      color: car.color,
      assignedUser,
      documents,
      totalCosts12m: parseFloat(totalCosts12m.toFixed(2)),
    };
  });

  res.json(overview);
});
