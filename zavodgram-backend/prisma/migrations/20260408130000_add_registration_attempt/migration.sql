-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELED');

-- CreateTable
CREATE TABLE "RegistrationAttempt" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "passwordHash" TEXT NOT NULL,
    "verificationTokenHash" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "telegramId" TEXT,
    "telegramUsername" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationAttempt_verificationTokenHash_key" ON "RegistrationAttempt"("verificationTokenHash");

-- CreateIndex
CREATE INDEX "RegistrationAttempt_phone_status_idx" ON "RegistrationAttempt"("phone", "status");

-- CreateIndex
CREATE INDEX "RegistrationAttempt_tag_status_idx" ON "RegistrationAttempt"("tag", "status");

-- CreateIndex
CREATE INDEX "RegistrationAttempt_expiresAt_idx" ON "RegistrationAttempt"("expiresAt");
