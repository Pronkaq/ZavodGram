-- Add comment moderation controls for channel posts
ALTER TABLE "ChatMember"
ADD COLUMN "commentsMuted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Message"
ADD COLUMN "commentsEnabled" BOOLEAN NOT NULL DEFAULT true;
