-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "topicsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChatTopic" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatTopic_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "topicId" TEXT;

-- CreateIndex
CREATE INDEX "Message_topicId_createdAt_idx" ON "Message"("topicId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatTopic_chatId_createdAt_idx" ON "ChatTopic"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatTopic_chatId_title_key" ON "ChatTopic"("chatId", "title");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ChatTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatTopic" ADD CONSTRAINT "ChatTopic_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
