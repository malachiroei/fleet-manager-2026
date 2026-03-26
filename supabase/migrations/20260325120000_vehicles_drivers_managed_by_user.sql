-- Per-manager fleet slice within the same org:
-- NULL = legacy / shared — visible to all managers in the org.
-- Non-null = only that user (profiles.id / auth.uid()) sees the row in fleet lists,
--            and View As that user sees it; other managers do not.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS managed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS managed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_managed_by_user_id ON public.vehicles (managed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_managed_by_user_id ON public.drivers (managed_by_user_id);

COMMENT ON COLUMN public.vehicles.managed_by_user_id IS 'Fleet manager owner; NULL = all org managers may list this vehicle.';
COMMENT ON COLUMN public.drivers.managed_by_user_id IS 'Fleet manager owner; NULL = all org managers may list this driver.';
