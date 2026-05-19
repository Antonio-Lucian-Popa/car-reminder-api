import { addDays, addMonths, addYears, differenceInCalendarDays, startOfDay } from 'date-fns';
import { ReminderRepeat, ReminderStatus } from '@prisma/client';

export function computeStatus(expiresAt: Date, notifyBeforeDays: number): ReminderStatus {
  const days = differenceInCalendarDays(startOfDay(expiresAt), startOfDay(new Date()));
  if (days < 0) return 'EXPIRED';
  if (days <= notifyBeforeDays) return 'DUE_SOON';
  return 'ACTIVE';
}

export function nextDateFromRepeat(current: Date, repeat: ReminderRepeat, customRepeatDays?: number | null) {
  if (repeat === 'MONTHLY') return addMonths(current, 1);
  if (repeat === 'YEARLY') return addYears(current, 1);
  if (repeat === 'CUSTOM' && customRepeatDays) return addDays(current, customRepeatDays);
  return current;
}
