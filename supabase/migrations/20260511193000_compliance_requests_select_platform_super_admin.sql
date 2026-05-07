-- =============================================================================
-- compliance_requests: בעל פלטפורמה רואה בקשות בכל ארגון (מתג ארגון / View‑As).
-- אחרת RLS מאפשר רק user_belongs_to_org — מנהל העל שנכנס למסך ארגון «רביד»
-- לא רואה pending_admin_review אבל send-external-vehicle-renewal חוסם בשליחה חוזרת (409).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_requests'
  ) THEN
    DROP POLICY IF EXISTS "compliance_requests_select_platform_super_admin" ON public.compliance_requests;
    CREATE POLICY "compliance_requests_select_platform_super_admin"
      ON public.compliance_requests
      FOR SELECT
      TO authenticated
      USING (public.is_platform_super_admin(auth.uid()));

    -- צוות ציות בארגון: הרשאת compliance בפרופיל + שיוך לארגון
    DROP POLICY IF EXISTS "compliance_requests_select_org_compliance_staff" ON public.compliance_requests;
    CREATE POLICY "compliance_requests_select_org_compliance_staff"
      ON public.compliance_requests
      FOR SELECT
      TO authenticated
      USING (
        public.user_belongs_to_org(auth.uid(), org_id)
        AND EXISTS (
          SELECT 1
          FROM public.profiles pr
          WHERE pr.id = auth.uid()
            AND (
              pr.is_system_admin = true
              OR COALESCE(pr.permissions, '{}'::jsonb) @> '{"compliance":true}'::jsonb
            )
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
