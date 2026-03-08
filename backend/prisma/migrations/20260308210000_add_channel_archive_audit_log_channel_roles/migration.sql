-- AlterTable: add archivedAt to Channel
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- CreateEnum: ChannelRole
DO $$ BEGIN
  CREATE TYPE "ChannelRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: add role to ChannelMember
ALTER TABLE "ChannelMember" ADD COLUMN IF NOT EXISTS "role" "ChannelRole" NOT NULL DEFAULT 'MEMBER';

-- CreateTable: AuditLog
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "actorId" INTEGER NOT NULL,
    "targetType" VARCHAR(50) NOT NULL,
    "targetId" INTEGER,
    "targetName" VARCHAR(200),
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
