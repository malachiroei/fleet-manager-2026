-- מסמכי ציות (כולל סריקת תקנה 585): קריאה לצוות ארגון — הטבלה הייתה עם RLS ללא מדיניות (חסימה מלאה בפוסטגרסט).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_docs'
  ) THEN
    DROP POLICY IF EXISTS "compliance_docs_select_same_org" ON public.compliance_docs;
    CREATE POLICY "compliance_docs_select_same_org"
      ON public.compliance_docs
      FOR SELECT
      TO authenticated
      USING (public.user_belongs_to_org(auth.uid(), org_id));

    DROP POLICY IF EXISTS "compliance_docs_select_platform_super_admin" ON public.compliance_docs;
    CREATE POLICY "compliance_docs_select_platform_super_admin"
      ON public.compliance_docs
      FOR SELECT
      TO authenticated
      USING (public.is_platform_super_admin(auth.uid()));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
