-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "taxNumber" TEXT,
    "logoUrl" TEXT,
    "footerNote" TEXT,
    "termsAndConditions" TEXT,
    "reportShowLogo" BOOLEAN NOT NULL DEFAULT true,
    "reportShowAddress" BOOLEAN NOT NULL DEFAULT true,
    "reportShowPhone" BOOLEAN NOT NULL DEFAULT true,
    "reportShowEmail" BOOLEAN NOT NULL DEFAULT true,
    "reportShowWebsite" BOOLEAN NOT NULL DEFAULT true,
    "reportShowFooter" BOOLEAN NOT NULL DEFAULT false,
    "reportHeaderColor" TEXT NOT NULL DEFAULT 'E0E0E0',
    "reportAccentColor" TEXT NOT NULL DEFAULT '0D9488',
    "reportOrientation" TEXT NOT NULL DEFAULT 'portrait',
    "reportDensity" TEXT NOT NULL DEFAULT 'normal',
    "reportBorderStyle" TEXT NOT NULL DEFAULT 'bordered',
    "reportFieldsJson" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);
