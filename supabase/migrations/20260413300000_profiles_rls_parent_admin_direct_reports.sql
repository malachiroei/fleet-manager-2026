-- =============================================================================
-- היררכיה: חלק מהפרופילים משתמשים ב-parent_admin_id במקום managed_by_user_id.
-- מדיניות managed_by_me התייחסה רק ל-managed_by_user_id — מנהל לא ראה/לא עדכן
-- דרך RLS דיווחים עם parent בלבד. מרחיבים SELECT/UPDATE (מקביל ל-112).
-- =============================================================================

DROP POLICY IF EXISTS "profiles_select_managed_by_me" ON public.profiles;

CREATE POLICY "profiles_select_managed_by_me"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    (managed_by_user_id IS NOT NULL AND managed_by_user_id = auth.uid())
    OR (parent_admin_id IS NOT NULL AND parent_admin_id = auth.uid())
  );

COMMENT ON POLICY "profiles_select_managed_by_me" ON public.profiles IS
  'Manager sees direct reports by managed_by_user_id or parent_admin_id (cross-org).';

DROP POLICY IF EXISTS "profiles_update_managed_by_me" ON public.profiles;

CREATE POLICY "profiles_update_managed_by_me"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    (managed_by_user_id IS NOT NULL AND managed_by_user_id = auth.uid())
    OR (parent_admin_id IS NOT NULL AND parent_admin_id = auth.uid())
  )
  WITH CHECK (
    (managed_by_user_id IS NOT NULL AND managed_by_user_id = auth.uid())
    OR (parent_admin_id IS NOT NULL AND parent_admin_id = auth.uid())
  );

COMMENT ON POLICY "profiles_update_managed_by_me" ON public.profiles IS
  'Manager may update direct reports (managed_by_user_id or parent_admin_id).';

NOTIFY pgrst, 'reload schema';
