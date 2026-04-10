-- CreateTable
CREATE TABLE "TelegramChannelMirrorState" (
    "id" TEXT NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "targetChatId" TEXT NOT NULL,
    "lastImportedPostId" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelMirrorState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelMirrorState_sourceSlug_targetChatId_key" ON "TelegramChannelMirrorState"("sourceSlug", "targetChatId");

-- CreateIndex
CREATE INDEX "TelegramChannelMirrorState_targetChatId_idx" ON "TelegramChannelMirrorState"("targetChatId");
