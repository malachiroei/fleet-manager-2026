-- Platform super owner should be able to write fleet rows while viewing tenant orgs.
-- Fixes "new row violates row-level security policy for table vehicles" when main admin
-- switches to another admin fleet and adds a vehicle.

CREATE OR REPLACE FUNCTION public.can_org_admin_write(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.user_may_cross_org_fleet_read(_user_id) THEN
      true
    WHEN _org_id IS NULL THEN
      public.user_has_fleet_staff_privileges(_user_id)
    ELSE
      public.user_belongs_to_org(_user_id, _org_id)
      AND public.user_has_fleet_staff_privileges(_user_id)
  END;
$$;

COMMENT ON FUNCTION public.can_org_admin_write(uuid, uuid) IS
  'Org-scoped write: platform owner cross-org OR (in org + fleet staff).';
