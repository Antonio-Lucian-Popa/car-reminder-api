import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { validate } from '../../middleware/validate';
import { carIdSchema, createCarSchema, updateCarSchema } from './cars.schema';
import { AppError } from '../../lib/errors';

export const carsRouter = Router();
carsRouter.use(requireAuth);

carsRouter.get('/', async (req, res) => {
  const cars = await prisma.car.findMany({
    where: { companyId: req.user!.companyId },
    include: { reminders: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(cars);
});

carsRouter.post('/', requireRole('ADMIN', 'MANAGER'), validate(createCarSchema), async (req, res) => {
  const car = await prisma.car.create({ data: { ...req.body, companyId: req.user!.companyId } });
  res.status(201).json(car);
});

carsRouter.get('/:id', validate(carIdSchema), async (req, res) => {
  const id = req.params.id as string;
  const car = await prisma.car.findFirst({
    where: { id, companyId: req.user!.companyId },
    include: { reminders: { orderBy: { expiresAt: 'asc' } } }
  });
  if (!car) throw new AppError(404, 'Car not found');
  res.json(car);
});

carsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(updateCarSchema), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.car.findFirst({ where: { id, companyId: req.user!.companyId } });
  if (!existing) throw new AppError(404, 'Car not found');
  const car = await prisma.car.update({ where: { id }, data: req.body });
  res.json(car);
});

carsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), validate(carIdSchema), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.car.findFirst({ where: { id, companyId: req.user!.companyId } });
  if (!existing) throw new AppError(404, 'Car not found');
  await prisma.car.delete({ where: { id } });
  res.status(204).send();
});
