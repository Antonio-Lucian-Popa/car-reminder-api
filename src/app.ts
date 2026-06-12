import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { allowedOrigins, env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { carsRouter } from './modules/cars/cars.routes';
import { remindersRouter } from './modules/reminders/reminders.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { costsRouter } from './modules/costs/costs.routes';
import { fuelRouter } from './modules/fuel/fuel.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { companyRouter } from './modules/company/company.routes';
import { tripsRouter } from './modules/trips/trips.routes';
import { expensesRouter } from './modules/expenses/expenses.routes';
import { ocrRouter } from './modules/ocr/ocr.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { fleetRouter } from './modules/fleet/fleet.routes';
import { statsRouter } from './modules/stats/stats.routes';
import { errorHandler, notFound } from './middleware/error';

export const app = express();

if (env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'car-reminder-backend' }));
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/company', companyRouter);
app.use('/api/cars', carsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/costs', costsRouter);
app.use('/api/fuel', fuelRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/fleet', fleetRouter);
app.use('/api/stats', statsRouter);

app.use(notFound);
app.use(errorHandler);

function allowedOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(null, false);
}
