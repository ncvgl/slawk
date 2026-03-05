-- DropIndex
DROP INDEX "DirectMessage_content_trgm_idx";

-- DropIndex
DROP INDEX "Message_content_trgm_idx";

-- AddForeignKey
ALTER TABLE "ChannelRead" ADD CONSTRAINT "ChannelRead_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
