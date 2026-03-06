-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "threadId" INTEGER;

-- CreateIndex
CREATE INDEX "DirectMessage_threadId_idx" ON "DirectMessage"("threadId");

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
