-- =============================================================================
-- מסירת רכב: פרו ללא מיגרציות 202604126 / 202604127 / 202604129 חלקית —
-- חסרות user_may_insert_* וכו'. קובץ עצמאי: פונקציות + RLS, ללא app_role.
--
-- 1) ravid.malachi@gmail.com ב-bootstrap וב-JWT
-- 2) profiles.permissions.vehicle_delivery בארגון הרכב
-- 3) user_roles טקסטואלי driver/employee במקום has_role(..., app_role)
-- חברי צוות עם admin_access (בלי manage_team) נשענים על can_org_admin_write הקיים.
-- =============================================================================

-- ── קיום רכב (מקור: 202604129) — נדרש ל-JWT/bootstrap policies ──────────────
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

-- ── נהג-נושא (מקור: 202604127) ──────────────────────────────────────────────
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

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) IS
  'שורת handover: auth.uid() הוא user_id של driver_id והרכב תואם ארגון נהג.';

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) TO authenticated;

-- ── SELECT/UPDATE על שורות handover (מקור: 202604126; ללא app_role) ─────────
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

COMMENT ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) IS
  'RLS: צפייה/עדכון שורת vehicle_handovers.';

REVOKE ALL ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) TO authenticated;

-- ── Bootstrap owners (מייל רביד עם נקודה) ───────────────────────────────────
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
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND lower(trim(coalesce(p.email, ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
  );
$$;

COMMENT ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) IS
  'Bootstrap owners (כולל gmail עם נקודה לרביד).';

REVOKE ALL ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) TO authenticated;

-- ── מי רשאי INSERT handover לפי רכב (בלי ENUM app_role) ─────────────────────
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
            EXISTS (
              SELECT 1
              FROM public.profiles p
              WHERE p.id = _user_id
                AND COALESCE((p.permissions ->> 'vehicle_delivery')::boolean, false)
            )
            OR EXISTS (
              SELECT 1
              FROM public.user_roles ur
              WHERE ur.user_id = _user_id
                AND lower(trim(both from ur.role::text)) IN ('driver', 'employee')
            )
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

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) IS
  'מי רשאי INSERT vehicle_handovers לרכב; vehicle_delivery או צוות/נהג משויך.';

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) TO authenticated;

-- ── שער ל-RPC create_vehicle_handover ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_handover_row_check(
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
  SELECT
    _user_id IS NOT NULL
    AND (
      (
        public.user_may_insert_vehicle_handover(_user_id, _vehicle_id)
        OR (
          _driver_id IS NOT NULL
          AND public.user_may_insert_vehicle_handover_as_subject_driver(
            _user_id,
            _vehicle_id,
            _driver_id
          )
        )
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND public.user_is_fleet_bootstrap_owner(_user_id)
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND (
          lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
            'malachiroei@gmail.com',
            'ravidmalachi@gmail.com',
            'ravid.malachi@gmail.com'
          )
          OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) IN (
            'malachiroei@gmail.com',
            'ravidmalachi@gmail.com',
            'ravid.malachi@gmail.com'
          )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) IS
  'שער יחיד ל-INSERT ל-handover + create_vehicle_handover RPC.';

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) TO authenticated;

-- ── RLS: מסירים ומגדירים מחדש (תואם 126 + נתיב נהג-נושא מ-127) ─────────────
DROP POLICY IF EXISTS "vehicle_handovers_select_same_org" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_org_participants" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_update_org_admins" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_delete_org_admins" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_select_access" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_handover_access" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_update_handover_access" ON public.vehicle_handovers;

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

CREATE POLICY "vehicle_handovers_update_handover_access"
  ON public.vehicle_handovers FOR UPDATE
  TO authenticated
  USING (public.user_may_access_vehicle_handover_row(auth.uid(), id))
  WITH CHECK (public.user_may_access_vehicle_handover_row(auth.uid(), id));

-- מדינית JWT (fallback אם פרופיל/auth.users לא מסונכרנים ל-bootstrap)
DROP POLICY IF EXISTS "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_jwt_bootstrap_email"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND (
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
      OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com',
        'ravid.malachi@gmail.com'
      )
    )
  );

DROP POLICY IF EXISTS "vehicle_handovers_insert_bootstrap_owner" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_bootstrap_owner"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND public.user_is_fleet_bootstrap_owner(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.vehicle_handovers TO authenticated;

NOTIFY pgrst, 'reload schema';
