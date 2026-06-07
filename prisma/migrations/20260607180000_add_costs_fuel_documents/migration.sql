DO $$ BEGIN
  CREATE TYPE "CostCategory" AS ENUM ('FUEL', 'REPAIR', 'SERVICE', 'INSURANCE', 'ROAD_TAX', 'ROVINIETA', 'ITP', 'PARKING', 'WASHING', 'PARTS', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FuelKind" AS ENUM ('benzina', 'motorina', 'gpl', 'electric', 'hybrid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentType" AS ENUM ('RCA', 'CASCO', 'ITP', 'ROVINIETA', 'INVOICE', 'FUEL_RECEIPT', 'SERVICE_RECEIPT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Cost" (
  "id" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "category" "CostCategory" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RON',
  "date" TIMESTAMP(3) NOT NULL,
  "mileage" INTEGER,
  "vendor" TEXT,
  "notes" TEXT,
  "receiptImageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FuelLog" (
  "id" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "station" TEXT,
  "fuelType" "FuelKind" NOT NULL,
  "liters" DECIMAL(8,2) NOT NULL,
  "pricePerLiter" DECIMAL(8,3) NOT NULL,
  "total" DECIMAL(10,2) NOT NULL,
  "mileage" INTEGER,
  "fullTank" BOOLEAN NOT NULL DEFAULT true,
  "receiptImageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Document" (
  "id" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "type" "DocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "linkedCostId" TEXT,
  "linkedReminderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Cost_carId_date_idx" ON "Cost"("carId", "date");
CREATE INDEX IF NOT EXISTS "FuelLog_carId_date_idx" ON "FuelLog"("carId", "date");
CREATE INDEX IF NOT EXISTS "Document_carId_idx" ON "Document"("carId");

DO $$ BEGIN
  ALTER TABLE "Cost" ADD CONSTRAINT "Cost_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Document" ADD CONSTRAINT "Document_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
