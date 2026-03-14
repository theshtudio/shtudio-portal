-- ============================================================
-- Shtudio Client Portal — Supabase Schema (Phase 1 MVP)
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum ('admin', 'client');
create type report_ai_status as enum ('pending', 'processing', 'completed', 'failed');

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles: extends Supabase auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'client',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Clients: agency clients (companies)
create table clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  logo_url text,
  website text,
  primary_contact_name text,
  primary_contact_email text,
  integrations jsonb not null default '{}'::jsonb,  -- Phase 2: Google Ads, Meta, Analytics etc
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Client Users: links users to clients (a user belongs to one client)
create table client_users (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, client_id)
);

-- Reports: per-client reports
create table reports (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  period_start date,
  period_end date,
  pdf_storage_path text,              -- internal only, never exposed to clients
  ai_enhanced_html text,              -- the client-facing output
  ai_status report_ai_status not null default 'pending',
  ai_error text,                      -- error message if processing failed
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Report Sections: structured sections within a report (Phase 2 ready)
create table report_sections (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid not null references reports(id) on delete cascade,
  title text not null,
  content_html text,
  source_type text,                   -- 'pdf', 'google_ads', 'meta', 'analytics' etc
  source_data jsonb default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit Log: track important actions
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  action text not null,               -- 'report.created', 'report.published', 'client.created' etc
  resource_type text,                 -- 'report', 'client', 'user'
  resource_id uuid,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_profiles_role on profiles(role);
create index idx_profiles_email on profiles(email);
create index idx_clients_slug on clients(slug);
create index idx_clients_active on clients(is_active);
create index idx_client_users_user on client_users(user_id);
create index idx_client_users_client on client_users(client_id);
create index idx_reports_client on reports(client_id);
create index idx_reports_status on reports(ai_status);
create index idx_reports_published on reports(is_published);
create index idx_report_sections_report on report_sections(report_id);
create index idx_report_sections_order on report_sections(report_id, sort_order);
create index idx_audit_log_user on audit_log(user_id);
create index idx_audit_log_resource on audit_log(resource_type, resource_id);
create index idx_audit_log_created on audit_log(created_at desc);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

create trigger clients_updated_at before update on clients
  for each row execute function update_updated_at();

create trigger reports_updated_at before update on reports
  for each row execute function update_updated_at();

create trigger report_sections_updated_at before update on report_sections
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table clients enable row level security;
alter table client_users enable row level security;
alter table reports enable row level security;
alter table report_sections enable row level security;
alter table audit_log enable row level security;

-- Helper: check if current user is admin
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- Helper: get client IDs for current user
create or replace function user_client_ids()
returns setof uuid as $$
  select client_id from client_users
  where user_id = auth.uid();
$$ language sql security definer;

-- ---- PROFILES ----

-- Users can read their own profile; admins can read all
create policy "profiles_select" on profiles for select using (
  id = auth.uid() or is_admin()
);

-- Users can update their own profile
create policy "profiles_update" on profiles for update using (
  id = auth.uid()
) with check (
  id = auth.uid()
);

-- Admins can insert profiles (when creating client users)
create policy "profiles_insert_admin" on profiles for insert with check (
  is_admin()
);

-- ---- CLIENTS ----

-- Admins see all clients; client users see only their clients
create policy "clients_select" on clients for select using (
  is_admin() or id in (select user_client_ids())
);

-- Only admins can create/update/delete clients
create policy "clients_insert" on clients for insert with check (is_admin());
create policy "clients_update" on clients for update using (is_admin());
create policy "clients_delete" on clients for delete using (is_admin());

-- ---- CLIENT USERS ----

-- Admins see all; users see their own links
create policy "client_users_select" on client_users for select using (
  is_admin() or user_id = auth.uid()
);

create policy "client_users_insert" on client_users for insert with check (is_admin());
create policy "client_users_update" on client_users for update using (is_admin());
create policy "client_users_delete" on client_users for delete using (is_admin());

-- ---- REPORTS ----

-- Admins see all reports; clients see only their published reports
-- Note: clients never see pdf_storage_path (handled at API level)
create policy "reports_select" on reports for select using (
  is_admin() or (
    is_published = true
    and client_id in (select user_client_ids())
  )
);

create policy "reports_insert" on reports for insert with check (is_admin());
create policy "reports_update" on reports for update using (is_admin());
create policy "reports_delete" on reports for delete using (is_admin());

-- ---- REPORT SECTIONS ----

-- Same visibility as parent report
create policy "report_sections_select" on report_sections for select using (
  is_admin() or (
    report_id in (
      select id from reports
      where is_published = true
      and client_id in (select user_client_ids())
    )
  )
);

create policy "report_sections_insert" on report_sections for insert with check (is_admin());
create policy "report_sections_update" on report_sections for update using (is_admin());
create policy "report_sections_delete" on report_sections for delete using (is_admin());

-- ---- AUDIT LOG ----

-- Only admins can read/write audit log
create policy "audit_log_select" on audit_log for select using (is_admin());
create policy "audit_log_insert" on audit_log for insert with check (is_admin());

-- ============================================================
-- STORAGE BUCKET (run via Supabase dashboard or API)
-- ============================================================

-- Create a private bucket for report PDFs
-- This is informational — execute via dashboard:
--
-- insert into storage.buckets (id, name, public)
-- values ('report-pdfs', 'report-pdfs', false);
--
-- Storage policy: only admins can upload/read PDFs
-- create policy "report_pdfs_admin_insert"
--   on storage.objects for insert
--   with check (bucket_id = 'report-pdfs' and is_admin());
--
-- create policy "report_pdfs_admin_select"
--   on storage.objects for select
--   using (bucket_id = 'report-pdfs' and is_admin());
--
-- create policy "report_pdfs_admin_delete"
--   on storage.objects for delete
--   using (bucket_id = 'report-pdfs' and is_admin());

-- ============================================================
-- SEED: Create initial admin profile trigger
-- When a new user signs up, auto-create their profile
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'client')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
