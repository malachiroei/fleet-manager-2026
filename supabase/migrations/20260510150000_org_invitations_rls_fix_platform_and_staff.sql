-- =============================================================================
-- org_invitations RLS: תיקון 42501 על INSERT (הזמנת אדמין מחשבון על).
--
-- 1) user_may_cross_org_fleet_read — מסונכרן שוב עם is_platform_super_admin (תיקון drift
--    אחרי 20260505161000 שהצר רק לפי אימייל).
-- 2) מדיניות «בעל פלטפורמה» — מפורשות עם is_platform_super_admin (כמו user_feature_overrides).
-- 3) מדיניות ארגון — profiles.user_id בתת־שאילתה ישן לא תואם סכמה (id = auth.uid());
--    מחליפים ב־user_belongs_to_org + can_org_admin_write להזמנות.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_super_admin(_user_id);
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Alias של is_platform_super_admin — תואם 20260508120000; מתקן גרסאות ישנות של 20260505161000.';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

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
      USING (public.is_platform_super_admin(auth.uid()));

    CREATE POLICY "org_invitations_insert_platform_owner"
      ON public.org_invitations FOR INSERT
      TO authenticated
      WITH CHECK (public.is_platform_super_admin(auth.uid()));

    CREATE POLICY "org_invitations_delete_platform_owner"
      ON public.org_invitations FOR DELETE
      TO authenticated
      USING (public.is_platform_super_admin(auth.uid()));

    DROP POLICY IF EXISTS "org_invitations_select_own_org" ON public.org_invitations;
    CREATE POLICY "org_invitations_select_own_org"
      ON public.org_invitations FOR SELECT
      TO authenticated
      USING (public.user_belongs_to_org(auth.uid(), org_id));

    DROP POLICY IF EXISTS "org_invitations_insert_own_org" ON public.org_invitations;
    CREATE POLICY "org_invitations_insert_own_org"
      ON public.org_invitations FOR INSERT
      TO authenticated
      WITH CHECK (
        public.user_belongs_to_org(auth.uid(), org_id)
        AND public.can_org_admin_write(auth.uid(), org_id)
      );

    DROP POLICY IF EXISTS "org_invitations_delete_own_org" ON public.org_invitations;
    CREATE POLICY "org_invitations_delete_own_org"
      ON public.org_invitations FOR DELETE
      TO authenticated
      USING (
        public.user_belongs_to_org(auth.uid(), org_id)
        AND public.can_org_admin_write(auth.uid(), org_id)
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
