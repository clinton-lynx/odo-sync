ALTER TABLE "CallResult"
ADD COLUMN "calleCallId" TEXT,
ADD COLUMN "providerCallId" TEXT,
ADD COLUMN "providerAttemptStatus" TEXT,
ADD COLUMN "providerFailureCode" TEXT,
ADD COLUMN "providerFailureMessage" TEXT;
