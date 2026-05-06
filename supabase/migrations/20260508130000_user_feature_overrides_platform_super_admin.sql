-- =============================================================================
-- user_feature_overrides: מדינית נוספת לבעל פלטפורמה (is_platform_super_admin).
-- מסנכרן עם 20260508120000 flat RLS — user_is_fleet_bootstrap_owner / has_role
-- עלולים לא להספיק ב-upsert; is_platform_super_admin מזוהה עם auth בלבד.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_feature_overrides'
  ) THEN
    DROP POLICY IF EXISTS user_feature_overrides_platform_super_admin ON public.user_feature_overrides;
    CREATE POLICY user_feature_overrides_platform_super_admin
      ON public.user_feature_overrides
      FOR ALL
      TO authenticated
      USING (public.is_platform_super_admin(auth.uid()))
      WITH CHECK (public.is_platform_super_admin(auth.uid()));
  END IF;
END $$;

COMMENT ON POLICY user_feature_overrides_platform_super_admin ON public.user_feature_overrides IS
  'Platform owner (is_platform_super_admin) may manage any user feature override row.';

NOTIFY pgrst, 'reload schema';
