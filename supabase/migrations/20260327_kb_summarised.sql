-- Add summarised flag to kb_documents
-- Tracks whether a document has been processed through the summarisation
-- step of the pipeline (added 2026-03-27). Existing rows default to false
-- so they can be identified and reprocessed if needed.

ALTER TABLE kb_documents
  ADD COLUMN IF NOT EXISTS summarised boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN kb_documents.summarised IS
  'True once the document has been summarised by Claude as part of the ingest pipeline.';
