-- ──────────────────────────────────────────────────────────────────────────
-- Add flagging columns to kb_queries
-- Run in Supabase SQL editor (or via supabase db push)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.kb_queries ADD COLUMN IF NOT EXISTS flagged      boolean DEFAULT false;
ALTER TABLE public.kb_queries ADD COLUMN IF NOT EXISTS flag_comment text;
ALTER TABLE public.kb_queries ADD COLUMN IF NOT EXISTS query_id     uuid;

-- Partial index — only indexes the small subset of flagged rows
CREATE INDEX IF NOT EXISTS kb_queries_flagged_idx
  ON public.kb_queries (created_at DESC)
  WHERE flagged = true;
