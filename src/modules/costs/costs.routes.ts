import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import {
  createCostSchema,
  updateCostSchema,
  costIdSchema,
  costListSchema,
  costSummarySchema,
} from './costs.schema';

export const costsRouter = Router();
costsRouter.use(requireAuth);

function serializeCost(c: { amount: { toString(): string }; [key: string]: unknown }) {
  return { ...c, amount: parseFloat(c.amount.toString()) };
}

async function getOwnedCarIds(userId: string, carId?: string): Promise<string[]> {
  if (carId) {
    const car = await prisma.car.findFirst({ where: { id: carId, userId } });
    if (!car) throw new AppError(404, 'Car not found');
    return [carId];
  }
  const cars = await prisma.car.findMany({ where: { userId }, select: { id: true } });
  return cars.map((c) => c.id);
}

async function getOwnedCost(id: string, userId: string) {
  const cost = await prisma.cost.findFirst({
    where: { id },
    include: { car: { select: { userId: true } } },
  });
  if (!cost || cost.car.userId !== userId) throw new AppError(404, 'Cost not found');
  return cost;
}

// GET /api/costs/summary — deve ficar antes de /:id
costsRouter.get('/summary', validate(costSummarySchema), async (req, res) => {
  const { carId, month } = req.query as { carId?: string; month?: string };
  const carIds = await getOwnedCarIds(req.user!.id, carId);

  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (month) {
    const [year, m] = month.split('-').map(Number);
    dateFilter.gte = new Date(year, m - 1, 1);
    dateFilter.lt = new Date(year, m, 1);
  }

  const costs = await prisma.cost.findMany({
    where: { carId: { in: carIds }, ...(month ? { date: dateFilter } : {}) },
  });

  const total = costs.reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);
  const byCategory: Record<string, number> = {};
  for (const c of costs) {
    byCategory[c.category] = parseFloat(((byCategory[c.category] ?? 0) + parseFloat(c.amount.toString())).toFixed(2));
  }

  res.json({ total: parseFloat(total.toFixed(2)), byCategory, count: costs.length });
});

costsRouter.get('/', validate(costListSchema), async (req, res) => {
  const { carId } = req.query as { carId?: string };
  const carIds = await getOwnedCarIds(req.user!.id, carId);
  const costs = await prisma.cost.findMany({
    where: { carId: { in: carIds } },
    orderBy: { date: 'desc' },
  });
  res.json(costs.map(serializeCost));
});

costsRouter.post('/', validate(createCostSchema), async (req, res) => {
  const { carId, ...data } = req.body;
  await getOwnedCarIds(req.user!.id, carId);
  const cost = await prisma.cost.create({ data: { ...data, carId } });
  res.status(201).json(serializeCost(cost));
});

costsRouter.get('/:id', validate(costIdSchema), async (req, res) => {
  const cost = await getOwnedCost(req.params.id as string, req.user!.id);
  const { car: _car, ...rest } = cost;
  res.json(serializeCost(rest));
});

costsRouter.patch('/:id', validate(updateCostSchema), async (req, res) => {
  const existing = await getOwnedCost(req.params.id as string, req.user!.id);
  const cost = await prisma.cost.update({ where: { id: existing.id }, data: req.body });
  res.json(serializeCost(cost));
});

costsRouter.delete('/:id', validate(costIdSchema), async (req, res) => {
  const existing = await getOwnedCost(req.params.id as string, req.user!.id);
  await prisma.cost.delete({ where: { id: existing.id } });
  res.status(204).send();
});
