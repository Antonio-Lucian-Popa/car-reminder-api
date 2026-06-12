import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import {
  createTripSchema,
  updateTripSchema,
  tripIdSchema,
  closeTripSchema,
  rejectTripSchema,
  listTripsSchema,
} from './trips.schema';

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

function serializeBudget(budget: Prisma.Decimal | null | undefined) {
  return budget != null ? parseFloat(budget.toString()) : null;
}

function tripWhere(user: { id: string; companyId: string; role: string }): Prisma.TripWhereInput {
  if (user.role === 'EMPLOYEE') return { companyId: user.companyId, userId: user.id };
  return { companyId: user.companyId };
}

tripsRouter.get('/', validate(listTripsSchema), async (req, res) => {
  const { status, userId, from, to } = req.query as {
    status?: string; userId?: string; from?: Date; to?: Date;
  };

  const where: Prisma.TripWhereInput = { ...tripWhere(req.user!) };
  if (status) where.status = status as Prisma.EnumTripStatusFilter;
  if (userId && req.user!.role !== 'EMPLOYEE') where.userId = userId;
  if (from || to) {
    where.startDate = {};
    if (from) (where.startDate as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.startDate as Prisma.DateTimeFilter).lte = new Date(to);
  }

  const trips = await prisma.trip.findMany({
    where,
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { expenses: true } },
      expenses: { select: { amount: true } },
    },
  });

  const result = trips.map((t) => {
    const totalExpenses = t.expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
    return {
      id: t.id, companyId: t.companyId, userId: t.userId, destination: t.destination,
      purpose: t.purpose, startDate: t.startDate, endDate: t.endDate,
      budget: serializeBudget(t.budget), carId: t.carId, kmStart: t.kmStart, kmEnd: t.kmEnd,
      status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt,
      _count: t._count, totalExpenses: parseFloat(totalExpenses.toFixed(2)),
    };
  });

  res.json(result);
});

tripsRouter.post('/', validate(createTripSchema), async (req, res) => {
  const activeTrip = await prisma.trip.findFirst({
    where: { companyId: req.user!.companyId, userId: req.user!.id, status: 'ACTIVE' },
  });
  if (activeTrip) throw new AppError(409, 'You already have an active trip');

  if (req.body.carId) {
    const car = await prisma.car.findFirst({ where: { id: req.body.carId as string, companyId: req.user!.companyId } });
    if (!car) throw new AppError(404, 'Car not found');
  }

  const trip = await prisma.trip.create({
    data: { ...req.body, companyId: req.user!.companyId, userId: req.user!.id },
  });
  res.status(201).json({ ...trip, budget: serializeBudget(trip.budget) });
});

tripsRouter.get('/:id', validate(tripIdSchema), async (req, res) => {
  const tripWithRelations = await prisma.trip.findFirst({
    where: { id: String(req.params.id), ...tripWhere(req.user!) },
    include: {
      expenses: { orderBy: { date: 'asc' } },
      car: { select: { id: true, make: true, model: true, plateNumber: true } },
    },
  });
  if (!tripWithRelations) throw new AppError(404, 'Trip not found');

  const { expenses: rawExpenses, budget, ...rest } = tripWithRelations;
  const expenses = rawExpenses.map((e) => ({ ...e, amount: parseFloat(e.amount.toString()) }));
  res.json({ ...rest, budget: serializeBudget(budget), expenses });
});

tripsRouter.patch('/:id', validate(updateTripSchema), async (req, res) => {
  const existing = await prisma.trip.findFirst({
    where: { id: String(req.params.id), ...tripWhere(req.user!) },
  });
  if (!existing) throw new AppError(404, 'Trip not found');
  if (!['ACTIVE', 'CLOSED'].includes(existing.status)) {
    throw new AppError(400, 'Only ACTIVE or CLOSED trips can be edited');
  }

  if (req.body.carId) {
    const car = await prisma.car.findFirst({ where: { id: req.body.carId as string, companyId: req.user!.companyId } });
    if (!car) throw new AppError(404, 'Car not found');
  }

  const trip = await prisma.trip.update({ where: { id: existing.id }, data: req.body });
  res.json({ ...trip, budget: serializeBudget(trip.budget) });
});

tripsRouter.post('/:id/close', validate(closeTripSchema), async (req, res) => {
  const existing = await prisma.trip.findFirst({
    where: { id: String(req.params.id), ...tripWhere(req.user!) },
  });
  if (!existing) throw new AppError(404, 'Trip not found');
  if (existing.status !== 'ACTIVE') throw new AppError(400, 'Only ACTIVE trips can be closed');

  const trip = await prisma.trip.update({
    where: { id: existing.id },
    data: { status: 'CLOSED', endDate: existing.endDate ?? new Date(), kmEnd: req.body.kmEnd as number | undefined },
  });
  res.json({ ...trip, budget: serializeBudget(trip.budget) });
});

tripsRouter.post('/:id/submit', validate(tripIdSchema), async (req, res) => {
  const existing = await prisma.trip.findFirst({
    where: { id: String(req.params.id), ...tripWhere(req.user!) },
  });
  if (!existing) throw new AppError(404, 'Trip not found');
  if (existing.status !== 'CLOSED') throw new AppError(400, 'Only CLOSED trips can be submitted');

  const trip = await prisma.trip.update({ where: { id: existing.id }, data: { status: 'SUBMITTED' } });
  res.json({ ...trip, budget: serializeBudget(trip.budget) });
});

tripsRouter.post('/:id/approve', requireRole('MANAGER', 'ADMIN'), validate(tripIdSchema), async (req, res) => {
  const existing = await prisma.trip.findFirst({
    where: { id: String(req.params.id), companyId: req.user!.companyId },
  });
  if (!existing) throw new AppError(404, 'Trip not found');
  if (existing.status !== 'SUBMITTED') throw new AppError(400, 'Only SUBMITTED trips can be approved');

  const trip = await prisma.trip.update({ where: { id: existing.id }, data: { status: 'APPROVED' } });
  res.json({ ...trip, budget: serializeBudget(trip.budget) });
});

tripsRouter.post('/:id/reject', requireRole('MANAGER', 'ADMIN'), validate(rejectTripSchema), async (req, res) => {
  const existing = await prisma.trip.findFirst({
    where: { id: String(req.params.id), companyId: req.user!.companyId },
  });
  if (!existing) throw new AppError(404, 'Trip not found');
  if (existing.status !== 'SUBMITTED') throw new AppError(400, 'Only SUBMITTED trips can be rejected');

  const trip = await prisma.trip.update({
    where: { id: existing.id },
    data: {
      status: 'REJECTED',
      purpose: existing.purpose
        ? `${existing.purpose} | Respins: ${req.body.reason as string}`
        : `Respins: ${req.body.reason as string}`,
    },
  });
  res.json({ ...trip, budget: serializeBudget(trip.budget) });
});
