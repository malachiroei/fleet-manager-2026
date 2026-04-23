-- =============================================================================
-- mileage_logs RLS: align vehicle access with public.vehicles SELECT
-- (vehicles_select_org_scope after 20260402180000).
-- Fixes: "new row violates row-level security policy for table mileage_logs"
-- when the user can list/select the vehicle (e.g. platform cross-org read,
-- managed_by / fleet-staff rules) but INSERT used a narrower EXISTS.
-- Keeps assigned-driver path for drivers where org membership is inconsistent.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mileage_logs'
  ) THEN
    ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "mileage_logs_insert_authenticated" ON public.mileage_logs;
    DROP POLICY IF EXISTS "mileage_logs_select_authenticated" ON public.mileage_logs;

    CREATE POLICY "mileage_logs_insert_authenticated"
      ON public.mileage_logs FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = mileage_logs.vehicle_id
            AND (
              public.user_may_cross_org_fleet_read(auth.uid())
              OR (
                v.org_id IS NOT NULL
                AND public.user_belongs_to_org(auth.uid(), v.org_id)
                AND (
                  v.managed_by_user_id IS NULL
                  OR v.managed_by_user_id = auth.uid()
                  OR public.user_has_fleet_staff_privileges(auth.uid())
                )
              )
              OR (
                v.org_id IS NULL
                AND public.user_has_fleet_staff_privileges(auth.uid())
              )
              OR EXISTS (
                SELECT 1
                FROM public.drivers d
                WHERE d.id = v.assigned_driver_id
                  AND d.user_id = auth.uid()
              )
            )
        )
      );

    CREATE POLICY "mileage_logs_select_authenticated"
      ON public.mileage_logs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = mileage_logs.vehicle_id
            AND (
              public.user_may_cross_org_fleet_read(auth.uid())
              OR (
                v.org_id IS NOT NULL
                AND public.user_belongs_to_org(auth.uid(), v.org_id)
                AND (
                  v.managed_by_user_id IS NULL
                  OR v.managed_by_user_id = auth.uid()
                  OR public.user_has_fleet_staff_privileges(auth.uid())
                )
              )
              OR (
                v.org_id IS NULL
                AND public.user_has_fleet_staff_privileges(auth.uid())
              )
              OR EXISTS (
                SELECT 1
                FROM public.drivers d
                WHERE d.id = v.assigned_driver_id
                  AND d.user_id = auth.uid()
              )
            )
        )
      );
  END IF;
END $$;
