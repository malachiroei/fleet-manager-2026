-- =============================================================================
-- vehicle_service_logs INSERT נכשל ב-42501 כשהבדיקה היא EXISTS על public.vehicles:
-- ה-subquery כפוף ל-RLS של vehicles, אז נהג משויך / הקצאה פעילה לא רואה את השורה
-- גם כשמותר לו לעדכן טיפול. פונקציית SECURITY DEFINER קוראת את הרכב בלי RLS
-- ומיישמת את אותה לוגיקת גישה + נתיבי נהג/הקצאה (כמו mileage_logs).
-- בנוסף: GRANT SELECT על org_invitations ו-compliance_alerts ל-authenticated —
-- בפרוד הופיע «permission denied for table» (לא RLS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_audit_vehicle_service(_user_id uuid, _vehicle_id uuid)
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
        OR (
          v.org_id IS NOT NULL
          AND public.user_belongs_to_org(_user_id, v.org_id)
          AND (
            v.managed_by_user_id IS NULL
            OR v.managed_by_user_id = _user_id
            OR public.user_has_fleet_staff_privileges(_user_id)
          )
        )
        OR (
          v.org_id IS NULL
          AND public.user_has_fleet_staff_privileges(_user_id)
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
  );
$$;

COMMENT ON FUNCTION public.user_may_audit_vehicle_service(uuid, uuid) IS
  'RLS helper: may user write/read vehicle_service_logs for this vehicle (bypasses vehicles RLS in subquery).';

REVOKE ALL ON FUNCTION public.user_may_audit_vehicle_service(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_audit_vehicle_service(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "vehicle_service_logs_insert_vehicle_access" ON public.vehicle_service_logs;
DROP POLICY IF EXISTS "vehicle_service_logs_select_vehicle_access" ON public.vehicle_service_logs;

CREATE POLICY "vehicle_service_logs_insert_audit_access"
  ON public.vehicle_service_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.user_may_audit_vehicle_service(auth.uid(), vehicle_id)
  );

CREATE POLICY "vehicle_service_logs_select_audit_access"
  ON public.vehicle_service_logs FOR SELECT
  TO authenticated
  USING (public.user_may_audit_vehicle_service(auth.uid(), vehicle_id));

COMMENT ON POLICY "vehicle_service_logs_insert_audit_access" ON public.vehicle_service_logs IS
  'Insert service audit row when user may access vehicle (incl. assigned driver / active assignment).';

COMMENT ON POLICY "vehicle_service_logs_select_audit_access" ON public.vehicle_service_logs IS
  'Select service audit rows for vehicles the user may access.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_invitations'
  ) THEN
    GRANT SELECT ON TABLE public.org_invitations TO authenticated;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_alerts'
  ) THEN
    GRANT SELECT ON TABLE public.compliance_alerts TO authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
