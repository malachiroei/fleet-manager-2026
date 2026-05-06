-- =============================================================================
-- תיקון: infinite recursion detected in policy for relation "profiles"
-- מופיע אחרי deep clean כשלא הורצה מיגרציית ה-RLS המלאה, או כשיש policies
-- כפולים על profiles — וכשמדיניות על vehicles/drivers מכילה SELECT ל-profiles כ־invoker.
--
-- להריצה בשלמות ב-SQL Editor (בסדר מהלסשון למטה).
-- =============================================================================

-- ── א. פונקציות SECURITY DEFINER — קריאת permissions בלי invoker על profiles ──

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

-- ודא שהעוטפים הנפוצים הם SECURITY DEFINER (אחרת user_belongs_to_org עלול לפתוח מחדש RLS על profiles בתוך policy)
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

REVOKE ALL ON FUNCTION public.get_user_org_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_belongs_to_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;

-- פונקציות שמיגרציית RLS השטוח מניחה קיומן — אם לא הורץ ה־migration המלא, יש להגדיר כאן.
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

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_super_admin(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.user_has_fleet_staff_privileges(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text IN ('admin', 'fleet_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _user_id
        AND (
          COALESCE((p.permissions ->> 'admin_access')::boolean, false)
          OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_org_admin_write(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _org_id IS NULL THEN
      public.user_has_fleet_staff_privileges(_user_id)
    ELSE
      public.user_belongs_to_org(_user_id, _org_id)
      AND public.user_has_fleet_staff_privileges(_user_id)
  END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_fleet_staff_privileges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_fleet_staff_privileges(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_org_admin_write(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

-- ── ב. רענון מדיניות INSERT/UPDATE שעליהן הצמדנו SELECT ל-profiles (רכבים + נהגים) ──

DROP POLICY IF EXISTS "vehicles_insert_vehicles_permission" ON public.vehicles;

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

DROP POLICY IF EXISTS "drivers_insert_drivers_perm" ON public.drivers;

CREATE POLICY "drivers_insert_drivers_perm"
  ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND public.policy_profile_drivers_perm_allow(auth.uid())
  );

DROP POLICY IF EXISTS "drivers_update_drivers_perm" ON public.drivers;

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

-- ── ג. הסרת policies כפולים על profiles ושחזור baseline שטוח (מונע לולאות ממדיניות ישנות) ──

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

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

-- ארגונים במלוא הרשימה למתג ההחלפה אצל מנהל-העל (בנוסף לחברות דרך user_belongs_to_org).
DROP POLICY IF EXISTS organizations_select_platform_super_admin ON public.organizations;
CREATE POLICY organizations_select_platform_super_admin
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_platform_super_admin(auth.uid()));

NOTIFY pgrst, 'reload schema';
