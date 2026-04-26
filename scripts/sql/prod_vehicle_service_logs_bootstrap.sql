-- =============================================================================
-- Bootstrap: vehicle_service_logs + RLS (עדכון טיפול / ServiceUpdatePage)
-- הרצה ב-Supabase SQL Editor אם מופיע PGRST204 על vehicle_id או הטבלה חסרה.
-- מקור: supabase/migrations/20260412300000_create_vehicle_service_logs.sql
--       supabase/migrations/20260412400000_vehicle_service_logs_rls_security_definer.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles (id) ON DELETE CASCADE,
  plate_number text,
  service_type text NOT NULL,
  odometer_reading integer NOT NULL,
  photo_url text,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_service_logs_vehicle_id ON public.vehicle_service_logs (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_service_logs_created_at ON public.vehicle_service_logs (created_at DESC);

COMMENT ON TABLE public.vehicle_service_logs IS
  'Audit log for עדכון טיפול / service update form (before email notification).';

ALTER TABLE public.vehicle_service_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.vehicle_service_logs TO authenticated;
GRANT ALL ON TABLE public.vehicle_service_logs TO service_role;

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
DROP POLICY IF EXISTS "vehicle_service_logs_insert_audit_access" ON public.vehicle_service_logs;
DROP POLICY IF EXISTS "vehicle_service_logs_select_audit_access" ON public.vehicle_service_logs;

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
