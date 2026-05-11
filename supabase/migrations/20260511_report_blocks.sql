-- 20260511_report_blocks.sql
-- Phase A of the block-based report editor.
--
-- Adds a nullable JSONB column for per-report block layout customisation.
-- Null = no customisation; render the AI output in document order as
-- before. Existing rows keep rendering identically.
--
-- Populated shape (all fields optional):
--   {
--     "order":     ["block-id-1", "block-id-2", ...],   -- final display order
--     "hidden":    ["block-id-3"],                       -- block ids to skip
--     "overrides": { "block-id-4": { "html": "..." } }  -- inner-html overrides
--   }
--
-- Block ids come from the data-block-id attribute on each <section> wrapper
-- emitted by the report-generation prompt (Phase A prompt update lands in
-- the same PR as this migration).
--
-- Apply via the Supabase dashboard SQL editor after merging the PR.

alter table public.reports
  add column if not exists blocks jsonb default null;
