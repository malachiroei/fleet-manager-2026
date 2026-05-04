-- =============================================================================
-- Fleet SELECT: אין דילוג של «כל צוות הצי» על managed_by עבור עמיתים באותו org.
-- בעבר: user_has_fleet_staff_privileges גרם לכל אדמין בארגון לראות כל רכב/נהג.
-- עכשיו: באותו org רואים שורות עם managed_by ריק (legacy משותף), שורות של עצמי,
--        או שורות של המנהל הישיר (parent_admin_id / managed_by_user_id בפרופיל).
-- malachiroei / רביד (במיילי bootstrap) נשארים עם user_may_cross_org_fleet_read.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_read_managed_fleet_row(
  _viewer_id uuid,
  _managed_by_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _managed_by_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _viewer_id
        AND (
          p.parent_admin_id = _managed_by_user_id
          OR p.managed_by_user_id = _managed_by_user_id
        )
    );
$$;

COMMENT ON FUNCTION public.user_may_read_managed_fleet_row(uuid, uuid) IS
  'Delegate may read fleet rows owned by their parent/manager (profiles.parent_admin_id or managed_by_user_id).';

REVOKE ALL ON FUNCTION public.user_may_read_managed_fleet_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_read_managed_fleet_row(uuid, uuid) TO authenticated;

-- vehicles
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
        OR public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
      )
    )
    OR (
      org_id IS NULL
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  );

COMMENT ON POLICY "vehicles_select_org_scope" ON public.vehicles IS
  'Org: shared NULL managed_by, own managed_by, or delegate of owner; not peer admins.';

-- drivers (align with vehicles; keep viewer branch narrow)
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
        OR public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
      )
    )
    OR (
      public.has_role(auth.uid(), 'viewer'::public.app_role)
      AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
      )
    )
  );

COMMENT ON POLICY "drivers_select_org_scope" ON public.drivers IS
  'Org: shared NULL, own managed_by, delegate of owner; fleet_staff no longer bypasses peer rows.';

NOTIFY pgrst, 'reload schema';
