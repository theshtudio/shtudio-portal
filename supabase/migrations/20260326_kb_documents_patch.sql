-- ============================================================
-- Patch: add columns missing from the initial kb_documents table.
-- The table was created before the migration was finalised, so
-- created_at / updated_at / file_type may not exist yet.
-- All statements use ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ============================================================

ALTER TABLE public.kb_documents
  ADD COLUMN IF NOT EXISTS file_type   text,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Re-create the updated_at trigger in case it wasn't applied before.
DROP TRIGGER IF EXISTS kb_documents_updated_at ON public.kb_documents;
CREATE TRIGGER kb_documents_updated_at
  BEFORE UPDATE ON public.kb_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
