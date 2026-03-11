-- ─────────────────────────────────────────────────────────────────────────────
-- system_settings  — generic key/value store for app-wide configuration.
-- key:   text  PRIMARY KEY  (e.g. 'notification_emails')
-- value: jsonb              (e.g. '["admin@example.com","fleet@example.com"]')
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.system_settings (
  key        text        primary key,
  value      jsonb       not null default '{}',
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.set_system_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_system_settings_updated_at on public.system_settings;
create trigger trg_system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.set_system_settings_updated_at();

-- RLS: authenticated users may read and write (admin-only enforcement is done at
-- the app layer; add a role check here if stricter access control is needed).
alter table public.system_settings enable row level security;

drop policy if exists "authenticated can select system_settings" on public.system_settings;
create policy "authenticated can select system_settings"
  on public.system_settings for select
  to authenticated using (true);

drop policy if exists "authenticated can upsert system_settings" on public.system_settings;
create policy "authenticated can upsert system_settings"
  on public.system_settings for all
  to authenticated using (true) with check (true);

-- ── Seed defaults ─────────────────────────────────────────────────────────────
insert into public.system_settings (key, value) values
  ('notification_emails', '["malachiroei@gmail.com"]')
on conflict (key) do nothing;
