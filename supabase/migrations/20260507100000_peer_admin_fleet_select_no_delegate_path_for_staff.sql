-- =============================================================================
-- Peer-admin isolation (vehicles + drivers SELECT):
-- Fleet-staff users (admin / fleet_manager / admin_access / manage_team) must NOT
-- gain visibility to another peer admin's managed rows via
-- user_may_read_managed_fleet_row (delegate hierarchy). That path is for
-- non-staff delegates only.
--
-- Also re-apply platform-owner-only cross-org read: migration 20260506140000
-- overwrote 20260505161000 by reintroducing ravidmalachi@gmail.com.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
  );
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Only platform super owner may cross-org fleet read.';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

DROP POLICY IF EXISTS "vehicles_select_org_scope" ON public.vehicles;

CREATE POLICY "vehicles_select_org_scope"
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR (
          public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
          AND NOT public.user_has_fleet_staff_privileges(auth.uid())
        )
      )
    )
    OR (
      org_id IS NULL
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  );

COMMENT ON POLICY "vehicles_select_org_scope" ON public.vehicles IS
  'Org: NULL managed_by (shared), own managed_by, or delegate-of-owner unless fleet_staff; peer admins isolated.';

DROP POLICY IF EXISTS "drivers_select_org_scope" ON public.drivers;

CREATE POLICY "drivers_select_org_scope"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR (
          public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
          AND NOT public.user_has_fleet_staff_privileges(auth.uid())
        )
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = 'viewer'
      )
      AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR (
          public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
          AND NOT public.user_has_fleet_staff_privileges(auth.uid())
        )
      )
    )
  );

COMMENT ON POLICY "drivers_select_org_scope" ON public.drivers IS
  'Same visibility rules as vehicles; delegate path blocked for fleet_staff.';

NOTIFY pgrst, 'reload schema';
