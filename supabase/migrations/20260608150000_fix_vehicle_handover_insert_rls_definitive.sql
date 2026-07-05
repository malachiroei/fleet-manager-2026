-- =============================================================================
-- מסירת רכב: עדיין
--   new row violates row-level security policy for table "vehicle_handovers"
--
-- שורש: create_vehicle_handover (SECURITY DEFINER) עובר row_check אבל INSERT
-- עדיין נבדק מול RLS של המשתמש הקורא. מיגרציה 40000 איחדה INSERT למדיניות יחידה
-- עם row_check (auth.jwt בתוך פונקציה) — ב-RLS זה לעיתים נכשל גם כש-RPC עובר.
--
-- תיקון: מדיניות INSERT מפורשות (בעל פלטפורמה / JWT / bootstrap / צוות),
-- ניקוי מדיניות ישנות, grants מלאים, OWNER postgres ל-RPC.
-- =============================================================================

-- ── פונקציות הרשאה (מסונכרן עם 20260512140000 + הרשאות handover) ───────────
CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_super_admin(_user_id);
$$;

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
        public.is_platform_super_admin(_user_id)
        OR public.user_may_cross_org_fleet_read(_user_id)
        OR public.can_org_admin_write(_user_id, v.org_id)
        OR (
          v.org_id IS NOT NULL
          AND public.user_belongs_to_org(_user_id, v.org_id)
          AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = _user_id
              AND COALESCE(p.is_system_admin, false)
          )
        )
        OR (
          v.org_id IS NOT NULL
          AND public.user_belongs_to_org(_user_id, v.org_id)
          AND (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              WHERE p.id = _user_id
                AND (
                  COALESCE((p.permissions ->> 'vehicle_delivery')::boolean, false)
                  OR COALESCE((p.permissions ->> 'handover')::boolean, false)
                  OR COALESCE((p.permissions ->> 'admin_access')::boolean, false)
                )
            )
            OR EXISTS (
              SELECT 1
              FROM public.user_roles ur
              WHERE ur.user_id = _user_id
                AND lower(trim(both from ur.role::text)) IN ('admin', 'fleet_manager', 'driver', 'employee')
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
      public.user_may_insert_vehicle_handover(_user_id, _vehicle_id)
      OR (
        _driver_id IS NOT NULL
        AND public.user_may_insert_vehicle_handover_as_subject_driver(
          _user_id,
          _vehicle_id,
          _driver_id
        )
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND public.user_is_fleet_bootstrap_owner(_user_id)
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
          'malachiroei@gmail.com',
          'ravidmalachi@gmail.com',
          'ravid.malachi@gmail.com'
        )
      )
    );
$$;

-- ── RPC: INSERT אחרי אימות — RLS חייב לעבור עבור auth.uid() של הקורא ───────
CREATE OR REPLACE FUNCTION public.create_vehicle_handover(
  p_org_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_handover_type text,
  p_assignment_mode text,
  p_handover_date timestamp with time zone,
  p_odometer_reading integer,
  p_fuel_level text,
  p_photo_front_url text,
  p_photo_back_url text,
  p_photo_right_url text,
  p_photo_left_url text,
  p_signature_url text,
  p_notes text,
  p_created_by uuid
)
RETURNS public.vehicle_handovers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result public.vehicle_handovers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_created_by IS NOT NULL AND p_created_by <> uid THEN
    RAISE EXCEPTION 'created_by must match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_may_insert_vehicle_handover_row_check(uid, p_vehicle_id, p_driver_id) THEN
    RAISE EXCEPTION 'insert not permitted for vehicle_handovers'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.vehicle_handovers (
    org_id,
    vehicle_id,
    driver_id,
    handover_type,
    assignment_mode,
    handover_date,
    odometer_reading,
    fuel_level,
    photo_front_url,
    photo_back_url,
    photo_right_url,
    photo_left_url,
    signature_url,
    notes,
    created_by
  )
  VALUES (
    p_org_id,
    p_vehicle_id,
    p_driver_id,
    p_handover_type,
    COALESCE(NULLIF(trim(p_assignment_mode), ''), 'permanent'),
    COALESCE(p_handover_date, now()),
    p_odometer_reading,
    p_fuel_level,
    p_photo_front_url,
    p_photo_back_url,
    p_photo_right_url,
    p_photo_left_url,
    p_signature_url,
    p_notes,
    COALESCE(p_created_by, uid)
  )
  RETURNING * INTO STRICT result;

  RETURN result;
END;
$$;

ALTER FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) OWNER TO postgres;

-- ── RLS: ניקוי כל המדיניות הישנות על vehicle_handovers ─────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_handovers'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.vehicle_handovers',
      pol.policyname
    );
  END LOOP;
END $$;

ALTER TABLE public.vehicle_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_handovers NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_handovers_select_access"
  ON public.vehicle_handovers FOR SELECT
  TO authenticated
  USING (public.user_may_access_vehicle_handover_row(auth.uid(), id));

-- מדיניות 1: בעל פלטפורמה — ישירות ב-WITH CHECK (לא בתוך row_check)
CREATE POLICY "vehicle_handovers_insert_platform_super_admin"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_super_admin(auth.uid()));

-- מדיניות 2: bootstrap owners לפי auth.users / profiles
CREATE POLICY "vehicle_handovers_insert_bootstrap_owner"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND public.user_is_fleet_bootstrap_owner(auth.uid())
  );

-- מדיניות 3: JWT email מאומת בלבד (לא user_metadata — Supabase linter 0015)
CREATE POLICY "vehicle_handovers_insert_jwt_bootstrap_email"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
      'malachiroei@gmail.com',
      'ravidmalachi@gmail.com',
      'ravid.malachi@gmail.com'
    )
  );

-- מדיניות 4: צוות / נהג-נושא
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

-- ── Grants (שרשרת מלאה — כמו 20260607120000) ───────────────────────────────
REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.vehicle_exists_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vehicle_exists_by_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_platform_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_org_admin_write(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_belongs_to_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_fleet_staff_privileges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_fleet_staff_privileges(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.vehicle_handovers TO authenticated;

NOTIFY pgrst, 'reload schema';
