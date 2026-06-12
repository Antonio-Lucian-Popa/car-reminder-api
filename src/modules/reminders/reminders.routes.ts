import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import { createReminderSchema, reminderIdSchema, renewReminderSchema, updateReminderSchema } from './reminders.schema';
import { computeStatus } from './reminders.service';

export const remindersRouter = Router();
remindersRouter.use(requireAuth);

function reminderWhere(user: { id: string; companyId: string; role: string }, extra?: object) {
  // EMPLOYEE sees only their own reminders; others see all company reminders
  const base = user.role === 'EMPLOYEE'
    ? { userId: user.id, car: { companyId: user.companyId } }
    : { car: { companyId: user.companyId } };
  return { ...base, ...extra };
}

remindersRouter.get('/', async (req, res) => {
  const reminders = await prisma.reminder.findMany({
    where: reminderWhere(req.user!),
    include: { car: true },
    orderBy: { expiresAt: 'asc' }
  });
  res.json(reminders);
});

remindersRouter.get('/car/:carId', async (req, res) => {
  const carId = req.params.carId as string;
  const car = await prisma.car.findFirst({ where: { id: carId, companyId: req.user!.companyId } });
  if (!car) throw new AppError(404, 'Car not found');
  const reminders = await prisma.reminder.findMany({
    where: reminderWhere(req.user!, { carId: car.id }),
    orderBy: { expiresAt: 'asc' }
  });
  res.json(reminders);
});

remindersRouter.post('/car/:carId', validate(createReminderSchema), async (req, res) => {
  const carId = req.params.carId as string;
  const car = await prisma.car.findFirst({ where: { id: carId, companyId: req.user!.companyId } });
  if (!car) throw new AppError(404, 'Car not found');
  const status = computeStatus(req.body.expiresAt, req.body.notifyBeforeDays ?? 7);
  const reminder = await prisma.reminder.create({ data: { ...req.body, userId: req.user!.id, carId: car.id, status } });
  res.status(201).json(reminder);
});

remindersRouter.patch('/:id', validate(updateReminderSchema), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.reminder.findFirst({ where: { id, ...reminderWhere(req.user!) } });
  if (!existing) throw new AppError(404, 'Reminder not found');
  const expiresAt = req.body.expiresAt ?? existing.expiresAt;
  const notifyBeforeDays = req.body.notifyBeforeDays ?? existing.notifyBeforeDays;
  const status = computeStatus(expiresAt, notifyBeforeDays);
  const reminder = await prisma.reminder.update({ where: { id: existing.id }, data: { ...req.body, status } });
  res.json(reminder);
});

remindersRouter.post('/:id/renew', validate(renewReminderSchema), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.reminder.findFirst({ where: { id, ...reminderWhere(req.user!) } });
  if (!existing) throw new AppError(404, 'Reminder not found');
  const status = computeStatus(req.body.expiresAt, existing.notifyBeforeDays);
  const reminder = await prisma.reminder.update({
    where: { id: existing.id },
    data: { expiresAt: req.body.expiresAt, notes: req.body.notes ?? existing.notes, status, lastNotifiedAt: null }
  });
  res.json(reminder);
});

remindersRouter.delete('/:id', validate(reminderIdSchema), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.reminder.findFirst({ where: { id, ...reminderWhere(req.user!) } });
  if (!existing) throw new AppError(404, 'Reminder not found');
  await prisma.reminder.delete({ where: { id: existing.id } });
  res.status(204).send();
});
