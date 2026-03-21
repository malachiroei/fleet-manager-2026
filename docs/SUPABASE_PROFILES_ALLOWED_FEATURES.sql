-- Per-user UI feature flags (tokens like UI_FEATURE_STAR_HEADER), in addition to global version_manifest.changes.
-- Run in Supabase SQL editor. RLS must allow admins to UPDATE profiles.allowed_features for other users (see your admin policies).

alter table public.profiles
  add column if not exists allowed_features jsonb not null default '[]'::jsonb;

comment on column public.profiles.allowed_features is
  'JSON array: UI_FEATURE_* grants, and !UI_FEATURE_* to block a global manifest token for this user (2.7.37+). Merged with version_manifest in useFleetManifestUiGates (PRO).';

-- Example: grant star header to one user (replace UUID)
-- update public.profiles
-- set allowed_features = '["UI_FEATURE_STAR_HEADER"]'::jsonb
-- where id = '00000000-0000-0000-0000-000000000000';
