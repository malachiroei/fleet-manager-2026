-- Phase 2: Compliance request tokens + email workflow
create table if not exists public.compliance_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('vehicle', 'driver')),
  entity_id uuid not null,
  driver_id uuid references public.drivers(id) on delete set null,
  driver_email text not null,
  driver_name text,
  task_key text not null,
  task_label text not null,
  due_field text not null,
  due_date date,
  request_token text not null unique,
  request_url text not null,
  status text not null default 'sent' check (status in ('sent', 'opened', 'completed', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  email_id text,
  created_by uuid,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compliance_requests_org_id_idx
  on public.compliance_requests(org_id);

create index if not exists compliance_requests_driver_id_idx
  on public.compliance_requests(driver_id);

create index if not exists compliance_requests_entity_idx
  on public.compliance_requests(entity_type, entity_id);

create index if not exists compliance_requests_due_date_idx
  on public.compliance_requests(due_date);

alter table public.compliance_requests enable row level security;

create or replace function public.set_compliance_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_compliance_requests_updated_at on public.compliance_requests;
create trigger trg_compliance_requests_updated_at
before update on public.compliance_requests
for each row execute function public.set_compliance_requests_updated_at();
