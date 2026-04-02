-- ─────────────────────────────────────────────────────────────────────────────
-- Production / staging alignment:
-- 1) Vehicles SELECT: fleet staff (admin / fleet_manager / profile flags) can read
--    all vehicles in their org, not only rows where managed_by_user_id = self.
--    Non–fleet-staff users still limited to NULL managed_by or own managed_by.
-- 2) compliance_alerts: explicit SELECT for service_role (edge jobs / scripts).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "vehicles_select_org_scope" ON public.vehicles;

CREATE POLICY "vehicles_select_org_scope"
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
    )
    OR (
      org_id IS NULL
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_alerts'
  ) THEN
    DROP POLICY IF EXISTS "compliance_alerts_select_service_role" ON public.compliance_alerts;
    CREATE POLICY "compliance_alerts_select_service_role"
      ON public.compliance_alerts FOR SELECT TO service_role
      USING (true);
  END IF;
END $$;
