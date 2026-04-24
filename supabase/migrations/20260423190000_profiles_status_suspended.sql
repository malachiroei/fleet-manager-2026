-- Allow suspending accounts (team / admin) while keeping pending_approval + active.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending_approval', 'active', 'suspended'));

COMMENT ON COLUMN public.profiles.status IS
  'Account status: pending_approval (no data), active, or suspended (login blocked in app).';
