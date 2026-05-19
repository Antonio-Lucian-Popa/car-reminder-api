import { app } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { startReminderCron } from './jobs/reminder-cron';

const server = app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`);
  startReminderCron();
});

async function shutdown() {
  console.log('Shutting down...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
