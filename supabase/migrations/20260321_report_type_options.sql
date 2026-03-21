-- Add report_type and report_options columns to reports table
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS report_type TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS report_options JSONB;
