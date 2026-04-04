-- =============================================================================
-- 403 על GET vehicle_documents: מדיניות select_same_org עושה EXISTS על vehicles —
-- בהקשרים מסוימים (RLS מקונן / הרשאות) התת־שאילתה לא מחזירה שורה והמסמך נחסם.
-- מדיניות נוספת לבעל פלטפורמה: SELECT ישיר בלי join ל־vehicles.
-- INSERT שטוח (אופציונלי): אותו דבר אם WITH CHECK עם EXISTS על vehicles נכשל.
-- GRANT מפורש ל־authenticated (אם בפריסה בוצע REVOKE).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_documents'
  ) THEN
    DROP POLICY IF EXISTS "vehicle_documents_select_platform_owner" ON public.vehicle_documents;

    CREATE POLICY "vehicle_documents_select_platform_owner"
      ON public.vehicle_documents FOR SELECT
      TO authenticated
      USING (public.user_may_cross_org_fleet_read(auth.uid()));

    COMMENT ON POLICY "vehicle_documents_select_platform_owner" ON public.vehicle_documents IS
      'Platform owner may list/read all vehicle_documents rows (no nested vehicles RLS).';

    DROP POLICY IF EXISTS "vehicle_documents_insert_platform_owner_flat" ON public.vehicle_documents;

    CREATE POLICY "vehicle_documents_insert_platform_owner_flat"
      ON public.vehicle_documents FOR INSERT
      TO authenticated
      WITH CHECK (public.user_may_cross_org_fleet_read(auth.uid()));

    COMMENT ON POLICY "vehicle_documents_insert_platform_owner_flat" ON public.vehicle_documents IS
      'Platform owner may insert vehicle_documents for any vehicle_id.';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_documents TO authenticated;

NOTIFY pgrst, 'reload schema';
