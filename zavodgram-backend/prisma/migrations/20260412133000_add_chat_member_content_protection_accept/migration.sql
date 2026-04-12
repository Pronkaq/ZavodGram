ALTER TABLE "ChatMember"
ADD COLUMN IF NOT EXISTS "contentProtectionAccepted" BOOLEAN NOT NULL DEFAULT false;
