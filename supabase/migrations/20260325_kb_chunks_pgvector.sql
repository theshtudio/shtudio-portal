-- ============================================================
-- Knowledge Base: pgvector + kb_chunks table
-- Run this in Supabase SQL editor (or via supabase db push)
-- ============================================================

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- kb_chunks: stores chunked text + embeddings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- FK to the parent document record
  document_id   uuid        REFERENCES public.kb_documents(id) ON DELETE CASCADE,
  -- The raw text of this chunk
  content       text        NOT NULL,
  -- text-embedding-ada-002 produces 1536-dimensional vectors
  embedding     vector(1536),
  -- Position within the source document
  chunk_index   integer,
  -- Mirrors kb_documents.access_tier for efficient retrieval filtering
  access_tier   text        NOT NULL DEFAULT 'general',
  -- Approximate token count
  token_count   integer,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Approximate nearest-neighbour index (cosine distance)
-- IVFFlat with lists=100 is a good default for up to ~1M rows.
-- Rebuild with higher lists value if the table grows large.
-- ============================================================

CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
  ON public.kb_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS kb_chunks_document_idx  ON public.kb_chunks (document_id);
CREATE INDEX IF NOT EXISTS kb_chunks_tier_idx      ON public.kb_chunks (access_tier);

-- ============================================================
-- RLS: only service-role / admins may read or write
-- ============================================================

ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_chunks_admin_all" ON public.kb_chunks
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- match_kb_chunks: vector similarity search RPC
-- Usage:
--   select * from match_kb_chunks(embedding_vector, 0.78, 5);
-- ============================================================

CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.78,
  match_count     int   DEFAULT 5
)
RETURNS TABLE (
  id           uuid,
  document_id  uuid,
  content      text,
  chunk_index  integer,
  access_tier  text,
  metadata     jsonb,
  similarity   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    document_id,
    content,
    chunk_index,
    access_tier,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.kb_chunks
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
