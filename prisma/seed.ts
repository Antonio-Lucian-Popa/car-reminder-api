import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Demo credentials (all users share same password for dev convenience):
//   admin@demo.local   / Demo1234!  role: ADMIN
//   manager@demo.local / Demo1234!  role: MANAGER
//   accountant@demo.local / Demo1234!  role: ACCOUNTANT
//   employee@demo.local   / Demo1234!  role: EMPLOYEE

async function main() {
  const passwordHash = await bcrypt.hash('Demo1234!', 12);

  const company = await prisma.company.upsert({
    where: { cif: 'RO12345678' },
    update: {},
    create: {
      name: 'Demo SRL',
      cif: 'RO12345678',
      accountantEmail: 'contabil@demo.local',
      settings: {}
    }
  });

  const [admin, manager, accountant, employee] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@demo.local' },
      update: {},
      create: { email: 'admin@demo.local', passwordHash, firstName: 'Admin', lastName: 'Demo', companyId: company.id, role: 'ADMIN' }
    }),
    prisma.user.upsert({
      where: { email: 'manager@demo.local' },
      update: {},
      create: { email: 'manager@demo.local', passwordHash, firstName: 'Manager', lastName: 'Demo', companyId: company.id, role: 'MANAGER' }
    }),
    prisma.user.upsert({
      where: { email: 'accountant@demo.local' },
      update: {},
      create: { email: 'accountant@demo.local', passwordHash, firstName: 'Accountant', lastName: 'Demo', companyId: company.id, role: 'ACCOUNTANT' }
    }),
    prisma.user.upsert({
      where: { email: 'employee@demo.local' },
      update: {},
      create: { email: 'employee@demo.local', passwordHash, firstName: 'Employee', lastName: 'Demo', companyId: company.id, role: 'EMPLOYEE' }
    })
  ]);

  const car1 = await prisma.car.upsert({
    where: { companyId_plateNumber: { companyId: company.id, plateNumber: 'B-123-DEM' } },
    update: {},
    create: { companyId: company.id, assignedUserId: employee.id, make: 'Dacia', model: 'Logan', year: 2021, plateNumber: 'B-123-DEM', mileage: 45000 }
  });

  const car2 = await prisma.car.upsert({
    where: { companyId_plateNumber: { companyId: company.id, plateNumber: 'CJ-456-DEM' } },
    update: {},
    create: { companyId: company.id, assignedUserId: manager.id, make: 'Skoda', model: 'Octavia', year: 2022, plateNumber: 'CJ-456-DEM', mileage: 28000 }
  });

  await prisma.reminder.createMany({
    skipDuplicates: true,
    data: [
      {
        userId: admin.id,
        carId: car1.id,
        title: 'ITP Dacia Logan',
        category: 'ITP',
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        notifyBeforeDays: 14,
        repeat: 'YEARLY'
      },
      {
        userId: admin.id,
        carId: car1.id,
        title: 'RCA Dacia Logan',
        category: 'RCA',
        expiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        notifyBeforeDays: 30,
        repeat: 'YEARLY'
      },
      {
        userId: admin.id,
        carId: car2.id,
        title: 'Rovinieta Skoda',
        category: 'ROVINIETA',
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        notifyBeforeDays: 7,
        repeat: 'YEARLY'
      }
    ]
  });

  console.log(`Seeded company: ${company.name} (${company.id})`);
  console.log(`Users: admin=${admin.id}, manager=${manager.id}, accountant=${accountant.id}, employee=${employee.id}`);
  console.log(`Cars: ${car1.plateNumber}, ${car2.plateNumber}`);
}

main().finally(() => prisma.$disconnect());
