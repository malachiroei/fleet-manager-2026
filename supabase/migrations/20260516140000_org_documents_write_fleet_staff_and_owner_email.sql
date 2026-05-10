-- ════════════════════════════════════════════════════════════════════════════
-- org_documents — כתיבה לכל בעלי הרשאות צי (ללא תלות ב־can_org_admin_write + org),
-- + הרחבת אימייל הבעלים ל-cross-org (מניעת 0 שורות בעדכון ממרכז הטפסים).
--
-- רקע: מדיניות 20260510130000 השתמשה ב־can_org_admin_write(auth.uid(), profiles.org_id).
-- אם שיוך ארגון בפרופיל לא תואם org_members / תקלה ב־user_belongs_to_org — העדכון
-- לא חל (מציגים toast «העדכון לא הוחל»). טבלת org_documents גלובלית בלי org_id —
-- מספיק שמנהל צי יוכל לעדכן אם user_has_fleet_staff_privileges מחזיר true.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND lower(trim(coalesce(u.email, ''))) IN (
        'malachiroei@gmail.com',
        'malachiroel@gmail.com'
      )
  );
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'פלטפורמה: בעלים ידועים במייל (שני כתיבים אפשריים).';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

DO $$
DECLARE pol text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_documents'
  ) THEN
    RAISE NOTICE 'org_documents table missing — skipping';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY';

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'org_documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.org_documents', pol);
  END LOOP;

  EXECUTE $sql$
    CREATE POLICY "org_documents_select_authenticated"
      ON public.org_documents
      FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL)
  $sql$;

  EXECUTE $sql$
    CREATE POLICY "org_documents_insert_staff"
      ON public.org_documents
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY "org_documents_update_staff"
      ON public.org_documents
      FOR UPDATE TO authenticated
      USING (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
      WITH CHECK (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
  $sql$;

  EXECUTE $sql$
    CREATE POLICY "org_documents_delete_staff"
      ON public.org_documents
      FOR DELETE TO authenticated
      USING (
        public.user_may_cross_org_fleet_read(auth.uid())
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
  $sql$;
END $$;

NOTIFY pgrst, 'reload schema';
