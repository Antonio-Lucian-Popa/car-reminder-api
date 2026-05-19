import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@car-reminder.local' },
    update: {},
    create: { email: 'demo@car-reminder.local', passwordHash, firstName: 'Demo', lastName: 'User' }
  });

  const car = await prisma.car.upsert({
    where: { userId_plateNumber: { userId: user.id, plateNumber: 'B-123-CRM' } },
    update: {},
    create: { userId: user.id, make: 'BMW', model: 'Seria 3', year: 2020, plateNumber: 'B-123-CRM', mileage: 85000 }
  });

  await prisma.reminder.create({
    data: {
      userId: user.id,
      carId: car.id,
      title: 'ITP',
      category: 'ITP',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notifyBeforeDays: 7,
      repeat: 'YEARLY'
    }
  });
}

main().finally(() => prisma.$disconnect());
