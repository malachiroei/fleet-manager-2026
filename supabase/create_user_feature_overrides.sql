-- user_feature_overrides
-- Override ל-feature flags ברמת משתמש (מפתח = auth.users.id).
-- הרצה ב-Supabase SQL Editor אם הטבלה חסרה (מתקן 404 מ-PostgREST).

create table if not exists public.user_feature_overrides (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);

create index if not exists user_feature_overrides_user_id_idx
  on public.user_feature_overrides (user_id);

-- לפי בקשה: ללא RLS כדי שלא ייחסמו קריאות/עדכונים מצד הלקוח.
drop policy if exists "Users can view own overrides" on public.user_feature_overrides;
drop policy if exists "Admins can manage overrides" on public.user_feature_overrides;

alter table public.user_feature_overrides disable row level security;

grant select, insert, update, delete on table public.user_feature_overrides to authenticated;
grant select, insert, update, delete on table public.user_feature_overrides to service_role;
