-- Service records from «עדכן טיפול» (2.7.45+). Adjust RLS to your org model.
create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_type text not null,
  odometer integer not null,
  date date not null,
  notes text,
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists maintenance_records_vehicle_id_idx on public.maintenance_records (vehicle_id);
create index if not exists maintenance_records_date_idx on public.maintenance_records (date desc);

alter table public.maintenance_records enable row level security;

-- Example: org members can insert/select for vehicles in their org (customize as needed).
-- create policy "maintenance_records_select" on public.maintenance_records for select using (...);
-- create policy "maintenance_records_insert" on public.maintenance_records for insert with check (...);
