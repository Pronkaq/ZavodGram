ALTER TABLE "TelegramChannelMirrorState"
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "TelegramChannelMirrorState_createdByUserId_idx"
  ON "TelegramChannelMirrorState"("createdByUserId");
