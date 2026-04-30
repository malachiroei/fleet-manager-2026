create table if not exists public.compliance_docs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.compliance_requests(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  task_key text not null,
  file_url text not null,
  file_kind text not null check (file_kind in ('signature', 'license_photo')),
  created_at timestamptz not null default now()
);

create index if not exists compliance_docs_request_id_idx on public.compliance_docs(request_id);
create index if not exists compliance_docs_driver_id_idx on public.compliance_docs(driver_id);
create index if not exists compliance_docs_org_id_idx on public.compliance_docs(org_id);

alter table public.compliance_docs enable row level security;

alter table public.compliance_requests
  add column if not exists completed_at timestamptz,
  add column if not exists consumed_at timestamptz;
