-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "maxVehicles" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'DECOUVERTE',
ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "imageUrl" TEXT;
