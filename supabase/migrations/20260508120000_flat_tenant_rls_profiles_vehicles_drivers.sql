-- =============================================================================
-- Multi-tenant RLS baseline: no recursive profiles self-joins in policies.
-- - public.get_user_org_id(uuid)  — SECURITY DEFINER read of profiles.org_id
-- - public.is_platform_super_admin(uuid) — auth.users email / known owner id
-- - public.user_belongs_to_org — uses get_user_org_id + org_members (no direct
--   profiles subquery that re-enters profiles RLS)
-- - public.user_may_cross_org_fleet_read — alias of is_platform_super_admin
-- Flat SELECT on vehicles/drivers: org membership OR platform super admin;
--   no managed_by_user_id / delegate paths.
-- Optional seed: org rows, profile org_id by email, org_members for platform
-- owner, vehicle/driver split (6 / 5 / rest) across three org UUIDs.
-- =============================================================================

-- ── 1) Drop every policy on the three tables (names differ across envs) ───
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'vehicles', 'drivers')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ── 2) Core helpers ─────────────────────────────────────────────────────────
-- לא לשנות שם פרמטר מול גרסה קיימת (42P13). $1 מתייחס ל־uuid בלי התנגשות עם עמודות.
CREATE OR REPLACE FUNCTION public.get_user_org_id(user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.org_id
  FROM public.profiles p
  WHERE p.id = $1
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_org_id(uuid) IS
  'Primary org_id from profiles without triggering profiles RLS (SECURITY DEFINER).';

CREATE OR REPLACE FUNCTION public.is_platform_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = _user_id
        AND (
          lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
          OR u.id = '200ebcdd-9900-4e74-88fd-1ff3993e5f3e'::uuid
        )
    );
$$;

COMMENT ON FUNCTION public.is_platform_super_admin(uuid) IS
  'Fleet platform owner — full cross-org read/write on scoped tables.';

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _org_id IS NOT NULL
    AND (
      public.get_user_org_id(_user_id) IS NOT DISTINCT FROM _org_id
      OR EXISTS (
        SELECT 1
        FROM public.org_members m
        WHERE m.user_id = _user_id
          AND m.org_id = _org_id
      )
    );
$$;

COMMENT ON FUNCTION public.user_belongs_to_org(uuid, uuid) IS
  'Membership: profiles.org_id (via get_user_org_id) or org_members.';

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_super_admin(_user_id);
$$;

REVOKE ALL ON FUNCTION public.get_user_org_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_platform_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_belongs_to_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

-- תת-שאילתות ל־profiles בתוך מדיניות RLS על טבלאות אחרות רצות כ־invoker ועלולות
-- לגרום ל־«infinite recursion detected in policy for relation profiles» (Postgres).
-- עטיפה ב־SECURITY DEFINER קוראת profiles מחוץ להקשר invoker.
CREATE OR REPLACE FUNCTION public.policy_profile_vehicle_perms_allow(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        COALESCE((p.permissions ->> 'vehicles')::boolean, false)
        OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
        OR COALESCE((p.permissions ->> 'admin_access')::boolean, false)
        OR (jsonb_typeof(p.allowed_features) = 'array' AND (p.allowed_features ? 'vehicles'))
      FROM public.profiles p
      WHERE p.id = _uid
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.policy_profile_drivers_perm_allow(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (p.permissions ->> 'drivers')::boolean
      FROM public.profiles p
      WHERE p.id = _uid
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.policy_profile_vehicle_perms_allow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_profile_vehicle_perms_allow(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.policy_profile_drivers_perm_allow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_profile_drivers_perm_allow(uuid) TO authenticated;

-- ── 3) profiles policies ────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_flat"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR id = auth.uid()
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
  );

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_flat"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR id = auth.uid()
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  )
  WITH CHECK (
    public.is_platform_super_admin(auth.uid())
    OR id = auth.uid()
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  );

-- ── 4) vehicles ─────────────────────────────────────────────────────────────
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicles_select_flat"
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
  );

CREATE POLICY "vehicles_insert_org_staff"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (
    (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND (
        public.can_org_admin_write(auth.uid(), org_id)
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  );

CREATE POLICY "vehicles_insert_vehicles_permission"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND (
      public.can_org_admin_write(auth.uid(), org_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text IN ('admin', 'fleet_manager')
      )
      OR public.policy_profile_vehicle_perms_allow(auth.uid())
    )
  );

CREATE POLICY "vehicles_update_org_staff"
  ON public.vehicles FOR UPDATE TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR (
      org_id IS NOT NULL
      AND (
        public.can_org_admin_write(auth.uid(), org_id)
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  )
  WITH CHECK (
    public.is_platform_super_admin(auth.uid())
    OR (
      org_id IS NOT NULL
      AND (
        public.can_org_admin_write(auth.uid(), org_id)
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  );

CREATE POLICY "vehicles_delete_org_staff"
  ON public.vehicles FOR DELETE TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.can_org_admin_write(auth.uid(), org_id)
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  );

CREATE POLICY "vehicles_update_assigned_driver_odometer"
  ON public.vehicles FOR UPDATE TO authenticated
  USING (
    assigned_driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid())
    AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
  )
  WITH CHECK (
    assigned_driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid())
    AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
  );

-- ── 5) drivers ──────────────────────────────────────────────────────────────
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers_select_flat"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = 'viewer'
      )
      AND org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
  );

CREATE POLICY "drivers_insert_org_staff"
  ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (
    (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND (
        public.can_org_admin_write(auth.uid(), org_id)
        OR public.user_has_fleet_staff_privileges(auth.uid())
      )
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  );

CREATE POLICY "drivers_insert_drivers_perm"
  ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND public.policy_profile_drivers_perm_allow(auth.uid())
  );

CREATE POLICY "drivers_update_org_staff"
  ON public.drivers FOR UPDATE TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.can_org_admin_write(auth.uid(), org_id)
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  )
  WITH CHECK (
    public.is_platform_super_admin(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.can_org_admin_write(auth.uid(), org_id)
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  );

CREATE POLICY "drivers_update_drivers_perm"
  ON public.drivers FOR UPDATE TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND public.policy_profile_drivers_perm_allow(auth.uid())
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND public.policy_profile_drivers_perm_allow(auth.uid())
  );

CREATE POLICY "drivers_update_own_linked_user"
  ON public.drivers FOR UPDATE TO authenticated
  USING (
    user_id IS NOT NULL
    AND user_id = auth.uid()
    AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
  )
  WITH CHECK (
    user_id IS NOT NULL
    AND user_id = auth.uid()
    AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
  );

CREATE POLICY "drivers_delete_org_staff"
  ON public.drivers FOR DELETE TO authenticated
  USING (
    public.is_platform_super_admin(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.can_org_admin_write(auth.uid(), org_id)
      AND public.user_belongs_to_org(auth.uid(), org_id)
    )
    OR (
      org_id IS NULL
      AND public.can_org_admin_write(auth.uid(), NULL)
    )
  );

-- ── 6) Seed orgs / memberships / splits (safe if tables missing) ────────────
DO $$
DECLARE
  v_super_org uuid := '857f2311-2ec5-41d3-8e32-dacd450a9a77'::uuid;
  v_org1 uuid := '11111111-2222-3333-4444-555555555555'::uuid;
  v_org2 uuid := '22222222-3333-4444-5555-666666666666'::uuid;
  v_owner uuid;
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.organizations (id, name)
  VALUES
    (v_super_org, 'Platform Main Fleet'),
    (v_org1, 'Fleet Organization 1'),
    (v_org2, 'Fleet Organization 2')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    UPDATE public.profiles AS p
    SET org_id = v_super_org,
        updated_at = now()
    WHERE lower(trim(coalesce(p.email, ''))) = 'malachiroei@gmail.com';

    UPDATE public.profiles AS p
    SET org_id = v_org1,
        updated_at = now()
    WHERE lower(trim(coalesce(p.email, ''))) IN (
      'ravidmalachi@gmail.com',
      'ravid.malachi@gmail.com',
      'arikzohargold@gmail.com',
      'malachiroei1@gmail.com'
    );

    UPDATE public.profiles AS p
    SET org_id = v_org2,
        updated_at = now()
    WHERE lower(trim(coalesce(p.email, ''))) = 'roeima21@gmail.com';
  END IF;

  IF to_regclass('public.org_members') IS NOT NULL THEN
    SELECT u.id
    INTO v_owner
    FROM auth.users u
    WHERE lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
    LIMIT 1;

    IF v_owner IS NOT NULL THEN
      -- חלק מהסביבות בלי UNIQUE(user_id, org_id) על org_members — בלי ON CONFLICT.
      INSERT INTO public.org_members (user_id, org_id)
      SELECT v_owner, v_super_org
      WHERE NOT EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = v_owner AND om.org_id = v_super_org
      );
      INSERT INTO public.org_members (user_id, org_id)
      SELECT v_owner, v_org1
      WHERE NOT EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = v_owner AND om.org_id = v_org1
      );
      INSERT INTO public.org_members (user_id, org_id)
      SELECT v_owner, v_org2
      WHERE NOT EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = v_owner AND om.org_id = v_org2
      );
    END IF;
  END IF;

  IF to_regclass('public.vehicles') IS NOT NULL THEN
    UPDATE public.vehicles v
    SET org_id = CASE
      WHEN n.rn <= 6 THEN v_super_org
      WHEN n.rn <= 11 THEN v_org1
      ELSE v_org2
    END,
    managed_by_user_id = NULL,
    updated_at = coalesce(v.updated_at, now())
    FROM (
      SELECT id,
        row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
      FROM public.vehicles
    ) n
    WHERE v.id = n.id;
  END IF;

  IF to_regclass('public.drivers') IS NOT NULL THEN
    UPDATE public.drivers d
    SET org_id = CASE
      WHEN n.rn <= 6 THEN v_super_org
      WHEN n.rn <= 11 THEN v_org1
      ELSE v_org2
    END,
    managed_by_user_id = NULL,
    updated_at = coalesce(d.updated_at, now())
    FROM (
      SELECT id,
        row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
      FROM public.drivers
    ) n
    WHERE d.id = n.id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
