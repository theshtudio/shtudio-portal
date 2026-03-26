-- ============================================================
-- KB Storage: add file_path column to kb_documents
-- ============================================================
-- After running this migration, create the storage bucket in
-- the Supabase dashboard (or via API):
--
--   Bucket name : kb-source-files
--   Public      : false
--   File size   : 10 MB max
--
-- Then add the following RLS policies on storage.objects:
--
--   INSERT: bucket_id = 'kb-source-files' AND is_admin()
--   SELECT: bucket_id = 'kb-source-files' AND is_admin()
--   DELETE: bucket_id = 'kb-source-files' AND is_admin()
-- ============================================================

ALTER TABLE public.kb_documents
  ADD COLUMN IF NOT EXISTS file_path text;

COMMENT ON COLUMN public.kb_documents.file_path IS
  'Storage path inside the kb-source-files bucket, e.g. "{docId}/{fileName}". '
  'Null for documents ingested before this column was added.';
