-- =============================================================================
-- mileage_logs RLS: allow any org member to log mileage for vehicles in their org
-- (report_mileage is enforced in the app; vehicles SELECT still uses managed_by).
-- Also: active driver_vehicle_assignments + drivers.user_id = auth.uid() when
-- vehicles.assigned_driver_id is missing or out of sync.
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
              OR EXISTS (
                SELECT 1
                FROM public.driver_vehicle_assignments a
                INNER JOIN public.drivers d ON d.id = a.driver_id
                WHERE a.vehicle_id = v.id
                  AND a.unassigned_at IS NULL
                  AND d.user_id = auth.uid()
                  AND (
                    v.org_id IS NULL
                    OR public.user_belongs_to_org(auth.uid(), v.org_id)
                  )
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
              OR EXISTS (
                SELECT 1
                FROM public.driver_vehicle_assignments a
                INNER JOIN public.drivers d ON d.id = a.driver_id
                WHERE a.vehicle_id = v.id
                  AND a.unassigned_at IS NULL
                  AND d.user_id = auth.uid()
                  AND (
                    v.org_id IS NULL
                    OR public.user_belongs_to_org(auth.uid(), v.org_id)
                  )
              )
            )
        )
      );
  END IF;
END $$;
