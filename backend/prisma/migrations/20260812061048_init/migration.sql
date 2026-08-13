-- CreateEnum
CREATE TYPE "CallWindow" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "CallStage" AS ENUM ('FIFTEEN_DAY', 'TEN_DAY', 'FIVE_DAY');

-- CreateEnum
CREATE TYPE "CallJobStatus" AS ENUM ('PENDING', 'FIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('BOOKED', 'DECLINED', 'CALLBACK_REQUESTED', 'NO_ANSWER');

-- CreateTable
CREATE TABLE "Vehicle" (
    "regnNo" TEXT NOT NULL,
    "makeModel" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "company" TEXT,
    "department" TEXT,
    "lastServiceDate" TIMESTAMP(3) NOT NULL,
    "lastServiceMileage" INTEGER,
    "preferredWindow" "CallWindow" NOT NULL DEFAULT 'MORNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("regnNo")
);

-- CreateTable
CREATE TABLE "CallJob" (
    "id" TEXT NOT NULL,
    "vehicleRegnNo" TEXT NOT NULL,
    "stage" "CallStage" NOT NULL,
    "scheduledFireDate" TIMESTAMP(3) NOT NULL,
    "preferredWindow" "CallWindow" NOT NULL,
    "status" "CallJobStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallResult" (
    "id" TEXT NOT NULL,
    "callJobId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "CallOutcome" NOT NULL,
    "proposedAppointmentDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CallResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallResult_callJobId_key" ON "CallResult"("callJobId");

-- AddForeignKey
ALTER TABLE "CallJob" ADD CONSTRAINT "CallJob_vehicleRegnNo_fkey" FOREIGN KEY ("vehicleRegnNo") REFERENCES "Vehicle"("regnNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallResult" ADD CONSTRAINT "CallResult_callJobId_fkey" FOREIGN KEY ("callJobId") REFERENCES "CallJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
