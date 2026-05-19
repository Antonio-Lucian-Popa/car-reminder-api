import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { carIdSchema, createCarSchema, updateCarSchema } from './cars.schema';
import { AppError } from '../../lib/errors';

export const carsRouter = Router();
carsRouter.use(requireAuth);

carsRouter.get('/', async (req, res) => {
  const cars = await prisma.car.findMany({ where: { userId: req.user!.id }, include: { reminders: true }, orderBy: { createdAt: 'desc' } });
  res.json(cars);
});

carsRouter.post('/', validate(createCarSchema), async (req, res) => {
  const car = await prisma.car.create({ data: { ...req.body, userId: req.user!.id } });
  res.status(201).json(car);
});

carsRouter.get('/:id', validate(carIdSchema), async (req, res) => {
  const car = await prisma.car.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { reminders: { orderBy: { expiresAt: 'asc' } } } });
  if (!car) throw new AppError(404, 'Car not found');
  res.json(car);
});

carsRouter.patch('/:id', validate(updateCarSchema), async (req, res) => {
  const existing = await prisma.car.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!existing) throw new AppError(404, 'Car not found');
  const car = await prisma.car.update({ where: { id: req.params.id }, data: req.body });
  res.json(car);
});

carsRouter.delete('/:id', validate(carIdSchema), async (req, res) => {
  const existing = await prisma.car.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!existing) throw new AppError(404, 'Car not found');
  await prisma.car.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
