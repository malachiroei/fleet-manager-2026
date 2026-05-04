-- drivers SELECT: fleet staff (admin / fleet_manager / profile permissions) reads all drivers in org,
-- same idea as vehicles (20260402153000). Fixes delegates seeing 0 drivers while vehicles worked via RLS.

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
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
    )
    OR (
      public.has_role(auth.uid(), 'viewer'::public.app_role)
      AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
    )
  );

COMMENT ON POLICY "drivers_select_org_scope" ON public.drivers IS
  'Org rows: fleet staff may read all drivers in org; others limited to NULL or own managed_by.';

NOTIFY pgrst, 'reload schema';
