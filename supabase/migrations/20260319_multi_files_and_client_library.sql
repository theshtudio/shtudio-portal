-- Multiple files per report: add TEXT[] column for multiple storage paths
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS pdf_storage_paths TEXT[];

-- Client file IDs stored on report for enhance context
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS client_file_ids UUID[];

-- Client file library
CREATE TABLE IF NOT EXISTS public.client_files (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_label TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.client_files ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with client files
CREATE POLICY "Admins can do everything" ON public.client_files
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Create storage bucket for client files (run via Supabase dashboard if not using CLI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('client-files', 'client-files', false)
-- ON CONFLICT DO NOTHING;
