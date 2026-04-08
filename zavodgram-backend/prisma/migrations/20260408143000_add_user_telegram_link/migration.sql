-- Add Telegram linkage fields directly to user profile
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "telegramId" TEXT,
  ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;

-- Enforce one Telegram account -> one app account
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");
