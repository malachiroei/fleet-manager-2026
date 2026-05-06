-- =============================================================================
-- user_feature_overrides: עמודת org_id + PK מורכב (user_id, org_id, feature_key)
-- כדי לסנן overrides לפי ארגון פעיל ולמנוע טעינת שורות מארגון אחר.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_feature_overrides'
  ) THEN
    RAISE NOTICE 'user_feature_overrides missing — skipped org_id migration';
    RETURN;
  END IF;

  ALTER TABLE public.user_feature_overrides
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE;

  UPDATE public.user_feature_overrides u
  SET org_id = p.org_id
  FROM public.profiles p
  WHERE p.id = u.user_id
    AND u.org_id IS NULL
    AND p.org_id IS NOT NULL;

  UPDATE public.user_feature_overrides u
  SET org_id = sub.first_org
  FROM (
    SELECT om.user_id AS uid, (array_agg(om.org_id ORDER BY om.org_id))[1] AS first_org
    FROM public.org_members om
    GROUP BY om.user_id
  ) sub
  WHERE u.user_id = sub.uid
    AND u.org_id IS NULL
    AND sub.first_org IS NOT NULL;

  DELETE FROM public.user_feature_overrides WHERE org_id IS NULL;

  ALTER TABLE public.user_feature_overrides DROP CONSTRAINT IF EXISTS user_feature_overrides_pkey;
  ALTER TABLE public.user_feature_overrides
    ADD CONSTRAINT user_feature_overrides_pkey PRIMARY KEY (user_id, org_id, feature_key);

  COMMENT ON COLUMN public.user_feature_overrides.org_id IS
    'ארגון שעבורו חל override; חייב להתאים ל-profiles.org_id של user_id.';
END $$;

-- ── RLS: הצמדת השורה לארגון היעד ───────────────────────────────────────────
DO $policies$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_feature_overrides'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $sql$
DROP POLICY IF EXISTS "user_feature_overrides_own" ON public.user_feature_overrides;
CREATE POLICY "user_feature_overrides_own"
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id = user_feature_overrides.org_id
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id = user_feature_overrides.org_id
    )
  );

DROP POLICY IF EXISTS "user_feature_overrides_same_org_staff" ON public.user_feature_overrides;
CREATE POLICY "user_feature_overrides_same_org_staff"
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles target
      WHERE target.id = user_feature_overrides.user_id
        AND target.org_id IS NOT NULL
        AND user_feature_overrides.org_id = target.org_id
        AND public.user_belongs_to_org(auth.uid(), target.org_id)
        AND public.can_org_admin_write(auth.uid(), target.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles target
      WHERE target.id = user_feature_overrides.user_id
        AND target.org_id IS NOT NULL
        AND user_feature_overrides.org_id = target.org_id
        AND public.user_belongs_to_org(auth.uid(), target.org_id)
        AND public.can_org_admin_write(auth.uid(), target.org_id)
    )
  );

DROP POLICY IF EXISTS user_feature_overrides_platform_super_admin ON public.user_feature_overrides;
CREATE POLICY user_feature_overrides_platform_super_admin
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (public.is_platform_super_admin(auth.uid()))
  WITH CHECK (public.is_platform_super_admin(auth.uid()));
  $sql$;

  -- מיגרציה 202604129: בסביבות ללא הפונקציה לא ניתן ליצור מדיניות שמפנה אליה
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'user_is_fleet_bootstrap_owner'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    EXECUTE $sql$
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
        AND t.org_id IS NOT NULL
        AND user_feature_overrides.org_id = t.org_id
    )
  )
  WITH CHECK (
    public.user_is_fleet_bootstrap_owner(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles t
      WHERE t.id = user_feature_overrides.user_id
        AND t.org_id IS NOT NULL
        AND user_feature_overrides.org_id = t.org_id
    )
  );
    $sql$;
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS "user_feature_overrides_fleet_bootstrap_owner" ON public.user_feature_overrides';
    RAISE NOTICE 'user_is_fleet_bootstrap_owner(uuid) missing — skipped fleet_bootstrap_owner policy (run migration 20260412900000_vehicle_handovers_bootstrap_insert_fallback.sql if needed)';
  END IF;
END $policies$;

NOTIFY pgrst, 'reload schema';
