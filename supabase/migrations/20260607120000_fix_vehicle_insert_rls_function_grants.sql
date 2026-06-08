-- =============================================================================
-- Fix fleet INSERT (vehicles + drivers) failing with:
--   permission denied for function user_may_cross_org_fleet_read
--   or opaque RLS failures when helper functions lack EXECUTE for authenticated.
--
-- RLS WITH CHECK calls can_org_admin_write() which referenced
-- user_may_cross_org_fleet_read(). When authenticated lacks EXECUTE on that
-- function the policy errors (instead of evaluating OR branches), blocking insert.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_super_admin(_user_id);
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Platform owner cross-org read — alias of is_platform_super_admin.';

CREATE OR REPLACE FUNCTION public.can_org_admin_write(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_platform_super_admin(_user_id) THEN
      true
    WHEN _org_id IS NULL THEN
      public.user_has_fleet_staff_privileges(_user_id)
    ELSE
      public.user_belongs_to_org(_user_id, _org_id)
      AND public.user_has_fleet_staff_privileges(_user_id)
  END;
$$;

COMMENT ON FUNCTION public.can_org_admin_write(uuid, uuid) IS
  'Org-scoped write: platform super admin cross-org OR (in org + fleet staff).';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_platform_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_org_admin_write(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_belongs_to_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_fleet_staff_privileges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_fleet_staff_privileges(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.policy_profile_vehicle_perms_allow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_profile_vehicle_perms_allow(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.policy_profile_drivers_perm_allow(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        COALESCE((p.permissions ->> 'drivers')::boolean, false)
        OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
        OR COALESCE((p.permissions ->> 'admin_access')::boolean, false)
        OR (jsonb_typeof(p.allowed_features) = 'array' AND (p.allowed_features ? 'drivers'))
      FROM public.profiles p
      WHERE p.id = _uid
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.policy_profile_drivers_perm_allow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_profile_drivers_perm_allow(uuid) TO authenticated;

DROP POLICY IF EXISTS "drivers_insert_drivers_perm" ON public.drivers;
CREATE POLICY "drivers_insert_drivers_perm"
  ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND (
      public.can_org_admin_write(auth.uid(), org_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text IN ('admin', 'fleet_manager')
      )
      OR public.policy_profile_drivers_perm_allow(auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
