-- =============================================================================
-- vehicle_documents: INSERT מותר ל־is_platform_super_admin (מדיניות handover_archive)
-- בעוד SELECT של "platform_owner" הסתמך רק על user_may_cross_org_fleet_read.
-- בתרחישים שבהם super admin לא מקבל את ה-flag — השורה נשמרת אך הרשימה נשארת ריקה.
-- מרחיבים SELECT (ו-INSERT השטוח) כך שיכללו גם is_platform_super_admin.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_documents'
  ) THEN
    DROP POLICY IF EXISTS "vehicle_documents_select_platform_owner" ON public.vehicle_documents;

    CREATE POLICY "vehicle_documents_select_platform_owner"
      ON public.vehicle_documents
      FOR SELECT
      TO authenticated
      USING (
        public.is_platform_super_admin(auth.uid())
        OR public.user_may_cross_org_fleet_read(auth.uid())
      );

    COMMENT ON POLICY "vehicle_documents_select_platform_owner" ON public.vehicle_documents IS
      'Platform super admin או בעל צי חוצה־ארגונים רואה את כל שורות vehicle_documents.';

    DROP POLICY IF EXISTS "vehicle_documents_insert_platform_owner_flat" ON public.vehicle_documents;

    CREATE POLICY "vehicle_documents_insert_platform_owner_flat"
      ON public.vehicle_documents
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.is_platform_super_admin(auth.uid())
        OR public.user_may_cross_org_fleet_read(auth.uid())
      );

    COMMENT ON POLICY "vehicle_documents_insert_platform_owner_flat" ON public.vehicle_documents IS
      'Platform super admin או בעל צי חוצה־ארגונים יכול להוסיף מסמך לכל רכב.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
