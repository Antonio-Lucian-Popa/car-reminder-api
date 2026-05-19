import cron from 'node-cron';
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { computeStatus } from '../modules/reminders/reminders.service';
import { notifyUser } from '../modules/notifications/notifications.service';

export async function runReminderCheck() {
  const reminders = await prisma.reminder.findMany({ include: { car: true } });
  const today = startOfDay(new Date());

  for (const reminder of reminders) {
    const daysLeft = differenceInCalendarDays(startOfDay(reminder.expiresAt), today);
    const status = computeStatus(reminder.expiresAt, reminder.notifyBeforeDays);

    if (status !== reminder.status) {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status } });
    }

    const shouldNotify = daysLeft >= 0 && daysLeft <= reminder.notifyBeforeDays;
    const notifiedToday = reminder.lastNotifiedAt && differenceInCalendarDays(today, startOfDay(reminder.lastNotifiedAt)) === 0;

    if (shouldNotify && !notifiedToday) {
      await notifyUser(reminder.userId, {
        title: `${reminder.title} expiră ${daysLeft === 0 ? 'azi' : `în ${daysLeft} zile`}`,
        body: `${reminder.car.make} ${reminder.car.model} (${reminder.car.plateNumber}) trebuie reînnoit.` ,
        data: { reminderId: reminder.id, carId: reminder.carId }
      });
      await prisma.reminder.update({ where: { id: reminder.id }, data: { lastNotifiedAt: new Date() } });
    }
  }
}

export function startReminderCron() {
  cron.schedule(env.REMINDER_CRON, () => {
    runReminderCheck().catch(console.error);
  });
  console.log(`Reminder cron scheduled: ${env.REMINDER_CRON}`);
}
