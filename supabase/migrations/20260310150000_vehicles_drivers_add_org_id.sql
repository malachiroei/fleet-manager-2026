-- Add org_id to vehicles and drivers so dashboard/list filter by current user's org.
-- Existing rows with NULL org_id will be visible when filtering by org (see app: .or(eq(org_id,X),is(org_id,null))).

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_org_id ON public.vehicles(org_id);
CREATE INDEX IF NOT EXISTS idx_drivers_org_id ON public.drivers(org_id);

COMMENT ON COLUMN public.vehicles.org_id IS 'Organization that owns this vehicle; NULL = legacy row, shown to all orgs until assigned.';
COMMENT ON COLUMN public.drivers.org_id IS 'Organization that owns this driver; NULL = legacy row, shown to all orgs until assigned.';
