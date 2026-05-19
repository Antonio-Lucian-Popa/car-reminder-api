CREATE TYPE "ReminderCategory" AS ENUM ('ITP', 'RCA', 'CASCO', 'ROVINIETA', 'REVIZIE', 'SCHIMB_ULEI', 'SCHIMB_ANVELOPE', 'TAXE', 'CUSTOM');
CREATE TYPE "ReminderRepeat" AS ENUM ('NONE', 'MONTHLY', 'YEARLY', 'CUSTOM');
CREATE TYPE "ReminderStatus" AS ENUM ('ACTIVE', 'DUE_SOON', 'EXPIRED', 'RENEWED');
CREATE TYPE "DeviceType" AS ENUM ('WEB_PUSH', 'EXPO_PUSH');
CREATE TYPE "DevicePlatform" AS ENUM ('WEB', 'IOS', 'ANDROID');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Car" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "year" INTEGER,
  "plateNumber" TEXT NOT NULL,
  "vin" TEXT,
  "mileage" INTEGER,
  "imageUrl" TEXT,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Car_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" "ReminderCategory" NOT NULL DEFAULT 'CUSTOM',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "notifyBeforeDays" INTEGER NOT NULL DEFAULT 7,
  "repeat" "ReminderRepeat" NOT NULL DEFAULT 'NONE',
  "customRepeatDays" INTEGER,
  "notes" TEXT,
  "status" "ReminderStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "DeviceType" NOT NULL,
  "platform" "DevicePlatform" NOT NULL,
  "endpoint" TEXT,
  "p256dh" TEXT,
  "auth" TEXT,
  "expoPushToken" TEXT,
  "userAgent" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
CREATE UNIQUE INDEX "Car_userId_plateNumber_key" ON "Car"("userId", "plateNumber");
CREATE INDEX "Car_userId_idx" ON "Car"("userId");
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");
CREATE INDEX "Reminder_carId_idx" ON "Reminder"("carId");
CREATE INDEX "Reminder_expiresAt_idx" ON "Reminder"("expiresAt");
CREATE INDEX "NotificationDevice_userId_idx" ON "NotificationDevice"("userId");
CREATE UNIQUE INDEX "NotificationDevice_userId_endpoint_key" ON "NotificationDevice"("userId", "endpoint");
CREATE UNIQUE INDEX "NotificationDevice_userId_expoPushToken_key" ON "NotificationDevice"("userId", "expoPushToken");

ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Car" ADD CONSTRAINT "Car_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDevice" ADD CONSTRAINT "NotificationDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
