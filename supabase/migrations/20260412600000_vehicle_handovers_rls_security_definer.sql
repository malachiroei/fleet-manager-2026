-- =============================================================================
-- מסירת/החזרת רכב: INSERT נכשל ב־permission denied / RLS —
-- 1) WITH CHECK על vehicles כפוף ל־RLS של vehicles (נהג לא «רואה» את הרכב).
-- 2) בדיקת driver דרך user_roles בתוך המדיניות — fragile (היסטוריה עם user_roles).
-- פונקציות SECURITY DEFINER קוראות vehicles/handover בלי RLS; has_role לתפקידים.
-- UPDATE: נהג/יוצר שורה חייבים לעדכן pdf_url אחרי archive — לא רק org admins.
-- =============================================================================

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

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) IS
  'RLS helper: may user INSERT vehicle_handovers for this vehicle (bypasses vehicles RLS).';

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

COMMENT ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) IS
  'RLS helper: SELECT/UPDATE vehicle_handovers row (archive PDF, lists) without nested vehicles RLS.';

REVOKE ALL ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "vehicle_handovers_select_same_org" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_org_participants" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_update_org_admins" ON public.vehicle_handovers;
-- אידמפוטנטיות: הרצה חוזרת של המיגרציה / סקריפט ידני
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
    AND public.user_may_insert_vehicle_handover(auth.uid(), vehicle_id)
  );

CREATE POLICY "vehicle_handovers_update_handover_access"
  ON public.vehicle_handovers FOR UPDATE
  TO authenticated
  USING (public.user_may_access_vehicle_handover_row(auth.uid(), id))
  WITH CHECK (public.user_may_access_vehicle_handover_row(auth.uid(), id));

-- הרשאות טבלה (בפרוד לפעמים חסר GRANT — PostgREST מחזיר permission denied)
GRANT SELECT, INSERT, UPDATE ON TABLE public.vehicle_handovers TO authenticated;

NOTIFY pgrst, 'reload schema';
