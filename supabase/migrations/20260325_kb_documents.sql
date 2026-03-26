-- ============================================================
-- KB Documents — tracks ingested source files
-- Depends on: 20260325_kb_chunks_pgvector.sql (kb_chunks table must exist)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kb_documents (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Human-readable label for the document
  title        text        NOT NULL,
  -- Original filename as uploaded
  file_name    text,
  -- File extension / type (e.g. 'txt', 'md', 'pdf')
  file_type    text,
  -- Who can see chunks from this document during retrieval
  -- 'general' = everyone | 'sensitive' = staff only | 'admin' = admin only
  access_tier  text        NOT NULL DEFAULT 'general'
                           CHECK (access_tier IN ('general', 'sensitive', 'admin')),
  -- Optional free-text tag (e.g. 'onboarding', 'pricing', 'google-ads')
  category     text,
  -- Ingestion status
  status       text        NOT NULL DEFAULT 'processing'
                           CHECK (status IN ('processing', 'ready', 'failed')),
  -- Set once ingestion completes
  chunk_count  integer,
  -- Set if ingestion fails
  error        text,
  created_by   uuid        REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_documents_status_idx   ON public.kb_documents (status);
CREATE INDEX IF NOT EXISTS kb_documents_tier_idx     ON public.kb_documents (access_tier);
CREATE INDEX IF NOT EXISTS kb_documents_category_idx ON public.kb_documents (category);

-- updated_at trigger (reuses the function defined in schema.sql)
CREATE TRIGGER kb_documents_updated_at
  BEFORE UPDATE ON public.kb_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_documents_admin_all" ON public.kb_documents
  USING (is_admin())
  WITH CHECK (is_admin());
