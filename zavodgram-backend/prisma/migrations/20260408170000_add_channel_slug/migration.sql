-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "channelSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_channelSlug_key" ON "Chat"("channelSlug");
