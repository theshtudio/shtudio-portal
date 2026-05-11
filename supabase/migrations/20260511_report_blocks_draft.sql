-- 20260511_report_blocks_draft.sql
-- Phase B of the block-based report editor.
--
-- Adds a draft column for in-progress block customisations. Workflow:
--   - blocks       (existing) → the LIVE / published block config that
--                              clients see at /share/[id] and /dashboard
--   - blocks_draft (new)      → the working state in the admin editor
--
-- Editor saves to blocks_draft on every change (debounced). When the admin
-- clicks "Publish changes", the route copies blocks_draft → blocks. When
-- the admin clicks "Reset to original AI output", both columns are set
-- to null.
--
-- Admin views default to (blocks_draft ?? blocks). Client views only ever
-- see `blocks`. ?preview=published on the admin view forces the blocks
-- column too, so admins can see what clients would see if published now.
--
-- Apply via the Supabase dashboard SQL editor after merging the PR.

alter table public.reports
  add column if not exists blocks_draft jsonb default null;
