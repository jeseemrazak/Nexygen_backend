-- CreateTable
CREATE TABLE "InstalledModule" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "installedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstalledModule_key_key" ON "InstalledModule"("key");
