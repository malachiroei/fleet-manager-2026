-- =============================================================================
-- drivers SELECT: לא להשתמש ב־EXISTS (SELECT … FROM user_roles) בתוך RLS —
-- בפרוד: «permission denied for table user_roles» ושבירת טעינת נהגים/דשבורד.
-- מחליפים ב־has_role() (SECURITY DEFINER).
-- GRANT SELECT על user_roles ל־authenticated (אם נשחק REVOKE בפריסה).
-- profiles: שורה אישית לפי id וגם user_id אם העמודה קיימת (DO דינמי).
-- =============================================================================

DROP POLICY IF EXISTS "drivers_select_org_scope" ON public.drivers;

CREATE POLICY "drivers_select_org_scope"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
    )
    OR (
      public.has_role(auth.uid(), 'viewer'::public.app_role)
      AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
    )
  );

GRANT SELECT ON TABLE public.user_roles TO authenticated;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'profiles'
      AND c.column_name = 'user_id'
  ) THEN
    EXECUTE $sel$
      CREATE POLICY "Users can view their own profile"
        ON public.profiles FOR SELECT TO authenticated
        USING (auth.uid() = id OR auth.uid() = user_id)
    $sel$;
    EXECUTE $upd$
      CREATE POLICY "Users can update their own profile"
        ON public.profiles FOR UPDATE TO authenticated
        USING (auth.uid() = id OR auth.uid() = user_id)
    $upd$;
  ELSE
    EXECUTE $sel$
      CREATE POLICY "Users can view their own profile"
        ON public.profiles FOR SELECT TO authenticated
        USING (auth.uid() = id)
    $sel$;
    EXECUTE $upd$
      CREATE POLICY "Users can update their own profile"
        ON public.profiles FOR UPDATE TO authenticated
        USING (auth.uid() = id)
    $upd$;
  END IF;
END $$;

COMMENT ON POLICY "Users can view their own profile" ON public.profiles IS
  'Own row: id = auth.uid() or legacy user_id = auth.uid().';

COMMENT ON POLICY "Users can update their own profile" ON public.profiles IS
  'Update own row: id = auth.uid() or legacy user_id = auth.uid().';

NOTIFY pgrst, 'reload schema';
