create table public.report_validation_warnings (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  warning_type text not null,
  details jsonb not null,
  created_at timestamp with time zone default now()
);

alter table public.report_validation_warnings enable row level security;

create policy "Service role has full access to report_validation_warnings"
  on public.report_validation_warnings
  for all
  to service_role
  using (true)
  with check (true);
