-- =============================================================================
-- Fix vehicle handover (מסירה) after grants fix still fails with:
--   new row violates row-level security policy for table "vehicle_handovers"
--
-- create_vehicle_handover checks user_may_insert_vehicle_handover_row_check (JWT /
-- bootstrap / staff) but INSERT RLS policies were narrower — row_check passed,
-- INSERT failed. Align RLS WITH CHECK with the same row_check gate.
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

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) IS
  'INSERT handover: platform owner, org staff, handover/vehicle_delivery perm, drivers.';

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

-- ── RLS INSERT: שער יחיד = אותה לוגיקה כמו create_vehicle_handover ─────────
DROP POLICY IF EXISTS "vehicle_handovers_insert_handover_access" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_bootstrap_owner" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "vehicle_handovers_insert_org_participants" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "Drivers can create handovers" ON public.vehicle_handovers;
DROP POLICY IF EXISTS "Authenticated users can create handovers" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_row_check"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.user_may_insert_vehicle_handover_row_check(
      auth.uid(),
      vehicle_id,
      driver_id
    )
  );

COMMENT ON POLICY "vehicle_handovers_insert_row_check" ON public.vehicle_handovers IS
  'מסירה/החזרה: אותו שער כמו RPC create_vehicle_handover.';

-- Grants (idempotent)
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

GRANT SELECT, INSERT, UPDATE ON TABLE public.vehicle_handovers TO authenticated;

NOTIFY pgrst, 'reload schema';
