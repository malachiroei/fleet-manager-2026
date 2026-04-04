-- =============================================================================
-- חבר צוות בארגון אחר (למשל רביד ב־ravid_org) עם managed_by_user_id = המנהל —
-- לא נראה בניהול צוות כי useTeamMembers בסופר־אדמין עושה SELECT לכל profiles
-- אבל RLS לא מעביר שורות בלי platform_owner / אותו org / is_manager.
-- מדיניות ייעודית: מי שמוגדר כמנהל ישיר (managed_by_user_id) רואה ומעדכן את הפרופילים
-- האלה גם בין־ארגונית. ללא תת־שאילתה על profiles → אין רקורסיה.
-- =============================================================================

DROP POLICY IF EXISTS "profiles_select_managed_by_me" ON public.profiles;

CREATE POLICY "profiles_select_managed_by_me"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (managed_by_user_id IS NOT NULL AND managed_by_user_id = auth.uid());

COMMENT ON POLICY "profiles_select_managed_by_me" ON public.profiles IS
  'Manager sees direct reports by managed_by_user_id (cross-org).';

DROP POLICY IF EXISTS "profiles_update_managed_by_me" ON public.profiles;

CREATE POLICY "profiles_update_managed_by_me"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (managed_by_user_id IS NOT NULL AND managed_by_user_id = auth.uid())
  WITH CHECK (managed_by_user_id IS NOT NULL AND managed_by_user_id = auth.uid());

COMMENT ON POLICY "profiles_update_managed_by_me" ON public.profiles IS
  'Manager may update direct reports (permissions/features); managed_by stays set to manager.';

-- org_invitations: בעל פלטפורמה — גישה גלובלית (תואם profiles_select_platform_owner).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_invitations'
  ) THEN
    DROP POLICY IF EXISTS "org_invitations_select_platform_owner" ON public.org_invitations;
    DROP POLICY IF EXISTS "org_invitations_insert_platform_owner" ON public.org_invitations;
    DROP POLICY IF EXISTS "org_invitations_delete_platform_owner" ON public.org_invitations;

    CREATE POLICY "org_invitations_select_platform_owner"
      ON public.org_invitations FOR SELECT
      TO authenticated
      USING (public.user_may_cross_org_fleet_read(auth.uid()));

    CREATE POLICY "org_invitations_insert_platform_owner"
      ON public.org_invitations FOR INSERT
      TO authenticated
      WITH CHECK (public.user_may_cross_org_fleet_read(auth.uid()));

    CREATE POLICY "org_invitations_delete_platform_owner"
      ON public.org_invitations FOR DELETE
      TO authenticated
      USING (public.user_may_cross_org_fleet_read(auth.uid()));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
