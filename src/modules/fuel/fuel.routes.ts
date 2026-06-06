import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import {
  createFuelSchema,
  updateFuelSchema,
  fuelIdSchema,
  fuelListSchema,
  fuelAnalyticsSchema,
} from './fuel.schema';

export const fuelRouter = Router();
fuelRouter.use(requireAuth);

type FuelLogRow = { liters: { toString(): string }; pricePerLiter: { toString(): string }; total: { toString(): string }; [key: string]: unknown };

function serializeFuelLog(l: FuelLogRow) {
  return {
    ...l,
    liters: parseFloat(l.liters.toString()),
    pricePerLiter: parseFloat(l.pricePerLiter.toString()),
    total: parseFloat(l.total.toString()),
  };
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

async function getOwnedLog(id: string, userId: string) {
  const log = await prisma.fuelLog.findFirst({
    where: { id },
    include: { car: { select: { userId: true } } },
  });
  if (!log || log.car.userId !== userId) throw new AppError(404, 'Fuel log not found');
  return log;
}

// GET /api/fuel/analytics — deve ficar antes de /:id
fuelRouter.get('/analytics', validate(fuelAnalyticsSchema), async (req, res) => {
  const { carId } = req.query as { carId?: string };
  const carIds = await getOwnedCarIds(req.user!.id, carId);

  const logs = await prisma.fuelLog.findMany({
    where: { carId: { in: carIds }, fullTank: true },
    orderBy: [{ carId: 'asc' }, { mileage: 'asc' }],
  });

  if (logs.length === 0) {
    return res.json({ averageConsumption: null, averagePricePerLiter: null, monthlyCost: null, kmBetweenFillups: null });
  }

  const avgPrice = logs.reduce((s, l) => s + parseFloat(l.pricePerLiter.toString()), 0) / logs.length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLogs = await prisma.fuelLog.findMany({
    where: { carId: { in: carIds }, date: { gte: monthStart } },
  });
  const monthlyCost = monthLogs.reduce((s, l) => s + parseFloat(l.total.toString()), 0);

  const logsWithMileage = logs.filter((l) => l.mileage != null);
  let avgConsumption: number | null = null;
  let kmBetweenFillups: number | null = null;

  if (logsWithMileage.length >= 2) {
    const kmDiffs: number[] = [];
    const consumptions: number[] = [];
    for (let i = 1; i < logsWithMileage.length; i++) {
      const km = logsWithMileage[i].mileage! - logsWithMileage[i - 1].mileage!;
      if (km > 0) {
        kmDiffs.push(km);
        consumptions.push((parseFloat(logsWithMileage[i].liters.toString()) / km) * 100);
      }
    }
    if (kmDiffs.length > 0) {
      kmBetweenFillups = Math.round(kmDiffs.reduce((s, k) => s + k, 0) / kmDiffs.length);
      avgConsumption = parseFloat((consumptions.reduce((s, c) => s + c, 0) / consumptions.length).toFixed(2));
    }
  }

  res.json({
    averageConsumption: avgConsumption,
    averagePricePerLiter: parseFloat(avgPrice.toFixed(3)),
    monthlyCost: parseFloat(monthlyCost.toFixed(2)),
    kmBetweenFillups,
  });
});

fuelRouter.get('/', validate(fuelListSchema), async (req, res) => {
  const { carId } = req.query as { carId?: string };
  const carIds = await getOwnedCarIds(req.user!.id, carId);
  const logs = await prisma.fuelLog.findMany({
    where: { carId: { in: carIds } },
    orderBy: { date: 'desc' },
  });
  res.json(logs.map(serializeFuelLog));
});

fuelRouter.post('/', validate(createFuelSchema), async (req, res) => {
  const { carId, ...data } = req.body;
  await getOwnedCarIds(req.user!.id, carId);
  const log = await prisma.fuelLog.create({ data: { ...data, carId } });
  res.status(201).json(serializeFuelLog(log));
});

fuelRouter.get('/:id', validate(fuelIdSchema), async (req, res) => {
  const log = await getOwnedLog(req.params.id as string, req.user!.id);
  const { car: _car, ...rest } = log;
  res.json(serializeFuelLog(rest));
});

fuelRouter.patch('/:id', validate(updateFuelSchema), async (req, res) => {
  const existing = await getOwnedLog(req.params.id as string, req.user!.id);
  const log = await prisma.fuelLog.update({ where: { id: existing.id }, data: req.body });
  res.json(serializeFuelLog(log));
});

fuelRouter.delete('/:id', validate(fuelIdSchema), async (req, res) => {
  const existing = await getOwnedLog(req.params.id as string, req.user!.id);
  await prisma.fuelLog.delete({ where: { id: existing.id } });
  res.status(204).send();
});
