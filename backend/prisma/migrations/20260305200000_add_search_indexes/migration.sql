-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on Message.content for ILIKE searches
CREATE INDEX IF NOT EXISTS "Message_content_trgm_idx" ON "Message" USING gin (content gin_trgm_ops);

-- GIN trigram index on DirectMessage.content for ILIKE searches
CREATE INDEX IF NOT EXISTS "DirectMessage_content_trgm_idx" ON "DirectMessage" USING gin (content gin_trgm_ops);
