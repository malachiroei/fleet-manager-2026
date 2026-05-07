-- =============================================================================
-- אדמין-על / מנהל מערכת: מסירת רכב עדיין חסומה ב-RLS כש־
-- user_may_cross_org_fleet_read «הצר» (202605051610) בלי לעקוף דרך UUID של בעל פלטפורמה,
-- או כש־profiles.is_system_admin ללא admin_access ב-JSON (can_org_admin_write false).
-- =============================================================================

-- יישור עם 20260508120000 / 20260510150000 (מקור אמת: is_platform_super_admin)
CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_super_admin(_user_id);
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Alias ל-is_platform_super_admin — כולל התאמת UID לבעל פלטפורמה, לא רק מייל.';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

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
  'INSERT handover: בעל פלטפורמה, צוות ארגון, is_system_admin בשיוך ארגון, נהג/vehicle_delivery.';

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) TO authenticated;

-- row_check קורא ל-user_may_insert — מספיק עדכון למעלה
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

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
