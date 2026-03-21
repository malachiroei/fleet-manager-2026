-- Optional: separate column for per-user UI feature denials (alternative to !TOKEN inside allowed_features).
-- The app reads this only if you add `denied_features` to the profiles SELECT in useAuth fetchProfile.
-- Until then, use entries like "!UI_FEATURE_STAR_HEADER" inside allowed_features (jsonb array).

alter table public.profiles
  add column if not exists denied_features jsonb not null default '[]'::jsonb;

comment on column public.profiles.denied_features is
  'JSON array of UI_FEATURE_* tokens blocked for this user (overrides manifest + allowed_features grants). Parsed by parseProfileUiFeatureDenylist second arg.';

-- The app selects `denied_features` in useAuth fetchProfile (2.7.39+). Run this migration first.
