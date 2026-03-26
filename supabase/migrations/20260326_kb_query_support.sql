-- ============================================================
-- KB query support
--   1. match_kb_chunks — updated with allowed_tiers filter
--   2. kb_queries      — audit log for every question asked
-- ============================================================

-- 1. Replace the RPC with a version that accepts an allowed_tiers array
--    so callers can scope retrieval to the tiers a user is permitted to see.
CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding  vector(1536),
  match_threshold  float   DEFAULT 0.75,
  match_count      int     DEFAULT 6,
  allowed_tiers    text[]  DEFAULT ARRAY['general', 'sensitive', 'admin']
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
  WHERE
    1 - (embedding <=> query_embedding) > match_threshold
    AND access_tier = ANY(allowed_tiers)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;


-- 2. Audit table for KB queries
CREATE TABLE IF NOT EXISTS public.kb_queries (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  question    text        NOT NULL,
  answer      text        NOT NULL,
  chunks_used integer     NOT NULL DEFAULT 0,
  had_results boolean     NOT NULL DEFAULT false,
  queried_by  uuid        REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_queries_admin_all" ON public.kb_queries
  USING (is_admin())
  WITH CHECK (is_admin());
