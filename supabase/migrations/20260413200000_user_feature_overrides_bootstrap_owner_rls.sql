-- =============================================================================
-- ניהול פיצ'רים (משתמש): UI מאפשר ל־malachiroei לערוך overrides לכל משתמש,
-- אך RLS אחרי 20260401140000 דורש user_belongs_to_org + can_org_admin_write —
-- בעל bootstrap לא תמיד "שייך" לארגון של הנושא → 403 על upsert.
-- מדינית PERMISSIVE נוספת: user_is_fleet_bootstrap_owner + קיום profiles לנושא.
-- דורש פונקציה public.user_is_fleet_bootstrap_owner (מיגרציה 202604129).
-- =============================================================================

DROP POLICY IF EXISTS "user_feature_overrides_fleet_bootstrap_owner" ON public.user_feature_overrides;

CREATE POLICY "user_feature_overrides_fleet_bootstrap_owner"
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (
    public.user_is_fleet_bootstrap_owner(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles t
      WHERE t.id = user_feature_overrides.user_id
    )
  )
  WITH CHECK (
    public.user_is_fleet_bootstrap_owner(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles t
      WHERE t.id = user_feature_overrides.user_id
    )
  );

COMMENT ON POLICY "user_feature_overrides_fleet_bootstrap_owner" ON public.user_feature_overrides IS
  'Platform bootstrap owners may manage feature overrides for any user with a profile row.';

NOTIFY pgrst, 'reload schema';
