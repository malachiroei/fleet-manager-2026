-- =============================================================================
-- הרצה חד-פעמית ב-Supabase SQL Editor (פרויקט production) —
-- דחיפה ל-Git לא מעדכנת את המסד; בלי להריץ SQL כאן — אותה שגיאת RLS באתר.
--
-- סדר: bootstrap + cross_org → פונקציות handover → מדיניות INSERT (כולל נהג נושא)
--       → מדינית INSERT נוספת לבעלי מייל bootstrap (רועי/רביד).
-- אידמפוטנטי: אפשר להריץ שוב.
-- אחרי הרצה: Dashboard → Settings → API → Reload schema (או NOTIFY למטה).
-- =============================================================================

-- ── 1) זיהוי בעלי פלטפורמה + קיום רכב בלי RLS (חייב לפני user_may_insert_vehicle_handover) ──
CREATE OR REPLACE FUNCTION public.user_is_fleet_bootstrap_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND lower(trim(coalesce(u.email, ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND lower(trim(coalesce(p.email, ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_fleet_bootstrap_owner(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.vehicle_exists_by_id(_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = _vehicle_id);
$$;

REVOKE ALL ON FUNCTION public.vehicle_exists_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vehicle_exists_by_id(uuid) TO authenticated;

-- ── 2) פונקציות INSERT/גישה לשורת handover ──
CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_handover(_user_id uuid, _vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = _vehicle_id
      AND (
        public.user_may_cross_org_fleet_read(_user_id)
        OR public.can_org_admin_write(_user_id, v.org_id)
        OR (
          v.org_id IS NOT NULL
          AND public.user_belongs_to_org(_user_id, v.org_id)
          AND (
            public.has_role(_user_id, 'driver'::public.app_role)
            OR EXISTS (
              SELECT 1
              FROM public.drivers d
              WHERE d.id = v.assigned_driver_id
                AND d.user_id = _user_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.driver_vehicle_assignments a
              INNER JOIN public.drivers d ON d.id = a.driver_id
              WHERE a.vehicle_id = v.id
                AND a.unassigned_at IS NULL
                AND d.user_id = _user_id
                AND (
                  v.org_id IS NULL
                  OR public.user_belongs_to_org(_user_id, v.org_id)
                )
            )
          )
        )
        OR (v.org_id IS NULL AND public.user_has_fleet_staff_privileges(_user_id))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_may_access_vehicle_handover_row(_user_id uuid, _handover_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicle_handovers h
    INNER JOIN public.vehicles v ON v.id = h.vehicle_id
    WHERE h.id = _handover_id
      AND (
        public.user_may_cross_org_fleet_read(_user_id)
        OR public.can_org_admin_write(_user_id, v.org_id)
        OR (h.created_by IS NOT NULL AND h.created_by = _user_id)
        OR EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = h.driver_id
            AND d.user_id = _user_id
        )
        OR (
          v.org_id IS NOT NULL
          AND public.user_belongs_to_org(_user_id, v.org_id)
          AND (
            v.managed_by_user_id IS NULL
            OR v.managed_by_user_id = _user_id
            OR public.user_has_fleet_staff_privileges(_user_id)
            OR EXISTS (
              SELECT 1
              FROM public.drivers d
              WHERE d.id = v.assigned_driver_id
                AND d.user_id = _user_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.driver_vehicle_assignments a
              INNER JOIN public.drivers d ON d.id = a.driver_id
              WHERE a.vehicle_id = v.id
                AND a.unassigned_at IS NULL
                AND d.user_id = _user_id
                AND (
                  v.org_id IS NULL
                  OR public.user_belongs_to_org(_user_id, v.org_id)
                )
            )
          )
        )
        OR (v.org_id IS NULL AND public.user_has_fleet_staff_privileges(_user_id))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(
  _user_id uuid,
  _vehicle_id uuid,
  _driver_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles v
    INNER JOIN public.drivers d ON d.id = _driver_id
    WHERE v.id = _vehicle_id
      AND d.user_id = _user_id
      AND d.user_id IS NOT NULL
      AND (
        v.org_id IS NULL
        OR d.org_id = v.org_id
        OR public.user_belongs_to_org(_user_id, v.org_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) TO authenticated;

-- ── 3) מדיניות RLS ──
DROP POLICY IF EXISTS "vehicle_handovers_select_same_org" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_org_participants" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_update_org_admins" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_select_access" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_handover_access" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_update_handover_access" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_bootstrap_owner" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_select_access"
  ON public.vehicle_handovers FOR SELECT
  TO authenticated
  USING (public.user_may_access_vehicle_handover_row(auth.uid(), id));

CREATE POLICY "vehicle_handovers_insert_handover_access"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.user_may_insert_vehicle_handover(auth.uid(), vehicle_id)
      OR (
        driver_id IS NOT NULL
        AND public.user_may_insert_vehicle_handover_as_subject_driver(
          auth.uid(),
          vehicle_id,
          driver_id
        )
      )
    )
  );

CREATE POLICY "vehicle_handovers_insert_bootstrap_owner"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND public.user_is_fleet_bootstrap_owner(auth.uid())
  );

CREATE POLICY "vehicle_handovers_update_handover_access"
  ON public.vehicle_handovers FOR UPDATE
  TO authenticated
  USING (public.user_may_access_vehicle_handover_row(auth.uid(), id))
  WITH CHECK (public.user_may_access_vehicle_handover_row(auth.uid(), id));

GRANT SELECT, INSERT, UPDATE ON TABLE public.vehicle_handovers TO authenticated;

NOTIFY pgrst, 'reload schema';

-- בדיקה (אופציונלי):
-- SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vehicle_handovers' ORDER BY policyname;
