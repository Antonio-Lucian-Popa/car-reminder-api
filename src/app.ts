import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { carsRouter } from './modules/cars/cars.routes';
import { remindersRouter } from './modules/reminders/reminders.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { errorHandler, notFound } from './middleware/error';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'car-reminder-backend' }));
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/cars', carsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/notifications', notificationsRouter);

app.use(notFound);
app.use(errorHandler);
