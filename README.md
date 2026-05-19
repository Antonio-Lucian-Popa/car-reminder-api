# Car Reminder Backend

Backend complet pentru aplicația Car Reminder: Express + TypeScript + Prisma + PostgreSQL + JWT access/refresh tokens + notificări pregătite pentru PWA și Expo.

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed
npm run dev
```

API: `http://localhost:4000`
Health check: `GET /health`

## Auth flow

- `POST /api/auth/register` → returnează `user`, `accessToken`, `refreshToken`
- `POST /api/auth/login` → returnează `user`, `accessToken`, `refreshToken`
- `POST /api/auth/refresh` cu `{ "refreshToken": "..." }` → returnează token-uri noi
- `POST /api/auth/logout` cu `{ "refreshToken": "..." }` → revocă refresh token-ul

Access token-ul este scurt, refresh token-ul este salvat hash-uit în DB și rotit la fiecare refresh.

## Main endpoints

### Cars

- `GET /api/cars`
- `POST /api/cars`
- `GET /api/cars/:id`
- `PATCH /api/cars/:id`
- `DELETE /api/cars/:id`

### Reminders

- `GET /api/reminders`
- `GET /api/reminders/car/:carId`
- `POST /api/reminders/car/:carId`
- `PATCH /api/reminders/:id`
- `POST /api/reminders/:id/renew`
- `DELETE /api/reminders/:id`

### Notifications

- `GET /api/notifications/vapid-public-key`
- `POST /api/notifications/subscribe`
- `POST /api/notifications/unsubscribe`

## Web Push

Generează VAPID keys:

```bash
npx tsx scripts/generate-vapid.ts
```

Pune valorile în `.env`:

```env
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:you@example.com"
```

## Expo Push viitor

Schema include deja `EXPO_PUSH` și `expoPushToken`. În `notifications.service.ts` există placeholder pentru integrarea Expo Push API.

## Cron remindere

Implicit rulează zilnic la 08:00:

```env
REMINDER_CRON="0 8 * * *"
```

Cron-ul verifică reminderele, actualizează statusul și trimite notificări când documentul expiră în intervalul configurat.
