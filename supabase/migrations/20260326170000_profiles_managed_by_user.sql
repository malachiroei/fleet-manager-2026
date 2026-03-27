-- Manager hierarchy: direct manager per profile.
-- NULL means top-level/unmanaged profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS managed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_managed_by_user_id
  ON public.profiles (managed_by_user_id);

COMMENT ON COLUMN public.profiles.managed_by_user_id IS
  'Direct manager profile id (profiles.id). NULL = unmanaged/top-level; visible only to system admins in team list.';
