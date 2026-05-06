-- =============================================================================
-- Security Advisor follow-up:
-- When a Supabase project is created/restored without replaying all migrations,
-- enabling RLS alone can BREAK the app (roles/profile/team/compliance checks).
--
-- This migration ensures baseline RLS policies exist for the core tables that
-- the frontend relies on:
-- - public.user_roles: user can SELECT own roles (to compute isAdmin/isManager)
-- - public.profiles: user can SELECT own profile; platform owner can SELECT all;
--   org-scoped staff can SELECT same-org profiles (team lists)
-- - public.compliance_alerts: authenticated can SELECT alerts scoped via
--   vehicles/drivers access (org or platform owner)
--
-- All changes are idempotent: we only create policies if no SELECT policy exists
-- (or if the specific policy name is missing).
-- =============================================================================

DO $$
DECLARE
  profiles_has_user_id boolean;
  profiles_has_org_id boolean;
BEGIN
  -- ---------------------------------------------------------------------------
  -- user_roles
  -- ---------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_roles'
  ) THEN
    EXECUTE 'ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_roles' AND cmd='SELECT'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles';
      EXECUTE $pol$
        CREATE POLICY "user_roles_select_own"
          ON public.user_roles FOR SELECT TO authenticated
          USING (auth.uid() = user_id)
      $pol$;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- profiles
  -- ---------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='profiles'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='user_id'
    ) INTO profiles_has_user_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='org_id'
    ) INTO profiles_has_org_id;

    -- Own profile (always safe).
    EXECUTE 'DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles';
    IF profiles_has_user_id THEN
      EXECUTE $pol$
        CREATE POLICY "profiles_select_own"
          ON public.profiles FOR SELECT TO authenticated
          USING (user_id = auth.uid())
      $pol$;
    ELSE
      -- Some projects model profiles.id as auth.uid() (no user_id column).
      EXECUTE $pol$
        CREATE POLICY "profiles_select_own"
          ON public.profiles FOR SELECT TO authenticated
          USING (id = auth.uid())
      $pol$;
    END IF;

    -- Platform owner cross-org team lists (matches repo policy name).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select_platform_owner'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "profiles_select_platform_owner"
          ON public.profiles FOR SELECT TO authenticated
          USING (public.user_may_cross_org_fleet_read(auth.uid()))
      $pol$;
    END IF;

    -- Same-org visibility for fleet staff (team mgmt pages).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select_same_org_team_manager'
    ) THEN
      IF profiles_has_org_id THEN
        EXECUTE $pol$
          CREATE POLICY "profiles_select_same_org_team_manager"
            ON public.profiles FOR SELECT TO authenticated
            USING (
              public.user_belongs_to_org(auth.uid(), org_id)
              AND public.user_has_fleet_staff_privileges(auth.uid())
            )
        $pol$;
      END IF;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- compliance_alerts
  -- ---------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='compliance_alerts'
  ) THEN
    EXECUTE 'ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='compliance_alerts' AND cmd='SELECT'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS "compliance_alerts_select_same_org" ON public.compliance_alerts';
      EXECUTE $pol$
        CREATE POLICY "compliance_alerts_select_same_org"
          ON public.compliance_alerts FOR SELECT TO authenticated
          USING (
            public.user_may_cross_org_fleet_read(auth.uid())
            OR (
              entity_type = 'vehicle'
              AND EXISTS (
                SELECT 1
                FROM public.vehicles v
                WHERE v.id = compliance_alerts.entity_id
                  AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
              )
            )
            OR (
              entity_type = 'driver'
              AND EXISTS (
                SELECT 1
                FROM public.drivers d
                WHERE d.id = compliance_alerts.entity_id
                  AND (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
              )
            )
          )
      $pol$;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

