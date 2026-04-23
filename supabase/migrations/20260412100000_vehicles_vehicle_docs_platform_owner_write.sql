-- =============================================================================
-- בעל פלטפורמה (user_may_cross_org_fleet_read): יכול לבחור רכבים בכל ארגון אבל
-- vehicles_update_org_admins דורש can_org_admin_write → לעתים 0 שורות בעדכון
-- ו־PostgREST מחזיר PGRST116 עם .single().
-- באותו אופן vehicle_documents INSERT/UPDATE/DELETE דורשים can_org_admin_write —
-- עדכון טיפול לא שמר מסמך תחת הכרטיס (הקוד בלקוח בולע שגיאת insert).
-- =============================================================================

DROP POLICY IF EXISTS "vehicles_update_platform_owner" ON public.vehicles;

CREATE POLICY "vehicles_update_platform_owner"
  ON public.vehicles FOR UPDATE
  TO authenticated
  USING (public.user_may_cross_org_fleet_read(auth.uid()))
  WITH CHECK (public.user_may_cross_org_fleet_read(auth.uid()));

COMMENT ON POLICY "vehicles_update_platform_owner" ON public.vehicles IS
  'Platform owner email may UPDATE any vehicle row (service update / odometer / admin).';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_documents'
  ) THEN
    DROP POLICY IF EXISTS "vehicle_documents_insert_platform_owner" ON public.vehicle_documents;
    DROP POLICY IF EXISTS "vehicle_documents_update_platform_owner" ON public.vehicle_documents;
    DROP POLICY IF EXISTS "vehicle_documents_delete_platform_owner" ON public.vehicle_documents;

    CREATE POLICY "vehicle_documents_insert_platform_owner"
      ON public.vehicle_documents FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.user_may_cross_org_fleet_read(auth.uid())
        )
      );

    CREATE POLICY "vehicle_documents_update_platform_owner"
      ON public.vehicle_documents FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.user_may_cross_org_fleet_read(auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.user_may_cross_org_fleet_read(auth.uid())
        )
      );

    CREATE POLICY "vehicle_documents_delete_platform_owner"
      ON public.vehicle_documents FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.user_may_cross_org_fleet_read(auth.uid())
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
