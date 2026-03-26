-- Granular access: JSON array of feature keys (e.g. "DAMAGE_REPORT").
-- NULL = not using this column (app falls back to legacy profiles.permissions).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_features jsonb;

COMMENT ON COLUMN public.profiles.allowed_features IS
  'JSON array of strings, e.g. ["DAMAGE_REPORT","VIEW_REPORTS"]. NULL = legacy permissions only; [] = no features from this system.';
