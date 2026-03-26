-- RLS: override לפיצ'רים — בעלים + admin/fleet_manager באותו org כמו היעד
-- מתאים ל-UserFeatureFlagsOverridesDialog (user_id = auth.users.id = profiles.id)

ALTER TABLE public.user_feature_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_feature_overrides_own" ON public.user_feature_overrides;
DROP POLICY IF EXISTS "user_feature_overrides_same_org_staff" ON public.user_feature_overrides;
DROP POLICY IF EXISTS "Users can view own overrides" ON public.user_feature_overrides;
DROP POLICY IF EXISTS "Admins can manage overrides" ON public.user_feature_overrides;

CREATE POLICY "user_feature_overrides_own"
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_feature_overrides_same_org_staff"
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles them ON them.id = user_feature_overrides.user_id
      WHERE me.id = auth.uid()
        AND me.org_id IS NOT NULL
        AND them.org_id = me.org_id
    )
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles them ON them.id = user_feature_overrides.user_id
      WHERE me.id = auth.uid()
        AND me.org_id IS NOT NULL
        AND them.org_id = me.org_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feature_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feature_overrides TO service_role;
