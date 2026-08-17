CREATE TABLE "WorkshopSettings" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "address" TEXT,
    "operatingHours" TEXT,
    "serviceDescription" TEXT,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopSettings_pkey" PRIMARY KEY ("id")
);
