import cron from 'node-cron';
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { computeStatus } from '../modules/reminders/reminders.service';
import { notifyUser } from '../modules/notifications/notifications.service';
import { sendMail } from '../lib/mailer';

// Categories that trigger critical digest notifications
const CRITICAL_CATEGORIES = ['RCA', 'ITP', 'ROVINIETA'];
const DIGEST_THRESHOLDS = [30, 14, 7, 1];

async function notifyCompanyManagers(companyId: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
  const managers = await prisma.user.findMany({
    where: { companyId, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
    select: { id: true, email: true, firstName: true },
  });

  for (const manager of managers) {
    await notifyUser(manager.id, payload);
  }

  return managers;
}

async function sendDigestEmail(companyId: string, digests: { title: string; car: string; daysLeft: number }[]) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, accountantEmail: true },
  });
  if (!company) return;

  const managers = await prisma.user.findMany({
    where: { companyId, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
    select: { email: true },
  });

  const recipients = [
    ...managers.map((m) => m.email),
    ...(company.accountantEmail ? [company.accountantEmail] : []),
  ].filter(Boolean);

  if (recipients.length === 0) return;

  const lines = digests.map((d) =>
    `• ${d.title} — ${d.car}: expiră ${d.daysLeft === 0 ? 'AZI' : `în ${d.daysLeft} zile`}`
  );

  await sendMail({
    to: recipients.join(','),
    subject: `[${company.name}] Digest documente flotă ce expiră`,
    text: `Documente critice flotă ${company.name}:\n\n${lines.join('\n')}\n\nVă rugăm să reînnoiți documentele la timp.`,
  });
}

export async function runReminderCheck() {
  const reminders = await prisma.reminder.findMany({
    include: { car: { select: { make: true, model: true, plateNumber: true, companyId: true } } },
  });
  const today = startOfDay(new Date());

  // Group critical digest items per company
  const digestByCompany: Record<string, { title: string; car: string; daysLeft: number }[]> = {};

  for (const reminder of reminders) {
    const daysLeft = differenceInCalendarDays(startOfDay(reminder.expiresAt), today);
    const status = computeStatus(reminder.expiresAt, reminder.notifyBeforeDays);

    if (status !== reminder.status) {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status } });
    }

    const shouldNotify = daysLeft >= 0 && daysLeft <= reminder.notifyBeforeDays;
    const notifiedToday = reminder.lastNotifiedAt &&
      differenceInCalendarDays(today, startOfDay(reminder.lastNotifiedAt)) === 0;

    if (shouldNotify && !notifiedToday) {
      const carLabel = `${reminder.car.make} ${reminder.car.model} (${reminder.car.plateNumber})`;
      const companyId = reminder.car.companyId;

      // Notify all ADMIN + MANAGER of the company
      await notifyCompanyManagers(companyId, {
        title: `${reminder.title} expiră ${daysLeft === 0 ? 'azi' : `în ${daysLeft} zile`}`,
        body: `${carLabel} trebuie reînnoit.`,
        data: { reminderId: reminder.id, carId: reminder.carId },
      });

      // Also notify the assigned user if different
      await notifyUser(reminder.userId, {
        title: `${reminder.title} expiră ${daysLeft === 0 ? 'azi' : `în ${daysLeft} zile`}`,
        body: `${carLabel} trebuie reînnoit.`,
        data: { reminderId: reminder.id, carId: reminder.carId },
      });

      await prisma.reminder.update({ where: { id: reminder.id }, data: { lastNotifiedAt: new Date() } });
    }

    // Collect critical digest items (RCA, ITP, ROVINIETA at 30/14/7/1 days)
    if (CRITICAL_CATEGORIES.includes(reminder.category) && DIGEST_THRESHOLDS.includes(daysLeft)) {
      const companyId = reminder.car.companyId;
      if (!digestByCompany[companyId]) digestByCompany[companyId] = [];
      digestByCompany[companyId].push({
        title: reminder.title,
        car: `${reminder.car.make} ${reminder.car.model} (${reminder.car.plateNumber})`,
        daysLeft,
      });
    }
  }

  // Send digest emails per company
  for (const [companyId, items] of Object.entries(digestByCompany)) {
    await sendDigestEmail(companyId, items).catch(console.error);
  }
}

export function startReminderCron() {
  cron.schedule(env.REMINDER_CRON, () => {
    runReminderCheck().catch(console.error);
  }, { timezone: env.REMINDER_CRON_TIMEZONE });
  console.log(`Reminder cron scheduled: ${env.REMINDER_CRON} (${env.REMINDER_CRON_TIMEZONE})`);
}
