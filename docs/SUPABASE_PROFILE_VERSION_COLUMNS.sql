-- =============================================================================
-- 1) Columns (run once)
-- =============================================================================
-- updated_at: חובה לעדכוני PATCH מהאפליקציה (heartbeat וכו'). אם חסר — PostgREST מחזיר 400.
alter table public.profiles
  add column if not exists updated_at timestamptz default now();

alter table public.profiles
  add column if not exists current_app_version text,
  add column if not exists target_version text;

comment on column public.profiles.current_app_version is 'Last bundle version reported by client (heartbeat)';
comment on column public.profiles.target_version is 'Optional semver: update modal gate';

-- =============================================================================
-- 2) RLS — let each logged-in user UPDATE their own row (heartbeat)
-- =============================================================================
-- If updates still fail: Table Editor → profiles → RLS policies — remove conflicting UPDATE rules.

alter table public.profiles enable row level security;

-- Replace with your naming convention; safe to re-run:
drop policy if exists "profiles_users_update_own" on public.profiles;

-- האפליקציה (2.7.11+) מסננת לפי profiles.id = auth.uid()
create policy "profiles_users_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Legacy: אם אצלך עדיין RLS לפי user_id, החלף ל-using/with check (auth.uid() = user_id)

-- =============================================================================
-- 3) SELECT own row (required if you only had INSERT before — client reads profile)
-- =============================================================================
drop policy if exists "profiles_users_select_own" on public.profiles;

create policy "profiles_users_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- =============================================================================
-- 4) Admin dashboard: see all profiles (optional — adjust role/table as you use)
-- =============================================================================
-- Example if you store admin in user_roles:
-- drop policy if exists "profiles_admin_select_all" on public.profiles;
-- create policy "profiles_admin_select_all"
--   on public.profiles for select to authenticated
--   using (
--     exists (
--       select 1 from public.user_roles ur
--       where ur.user_id = auth.uid() and ur.role = 'admin'
--     )
--   );
