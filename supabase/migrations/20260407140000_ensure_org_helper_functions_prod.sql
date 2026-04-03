-- =============================================================================
-- פרו (למשל fleet-manager-2026) לעיתים בלי מיגרציית 20260401140000 המלאה —
-- ב-Dashboard נשארות רק פונקציות ישנות, בלי user_belongs_to_org / user_has_fleet_staff_privileges.
-- submit_mileage_report ו-RLS על צי דורשים את שלושת העזרים האלה (כמו בסטייג').
-- =============================================================================

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
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = _user_id
          AND p.org_id IS NOT NULL
          AND p.org_id = _org_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.org_members m
        WHERE m.user_id = _user_id
          AND m.org_id = _org_id
      )
    );
$$;

COMMENT ON FUNCTION public.user_belongs_to_org(uuid, uuid) IS
  'True if profiles.org_id or org_members grants access to _org_id.';

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

COMMENT ON FUNCTION public.user_has_fleet_staff_privileges(uuid) IS
  'True if user_roles admin/fleet_manager OR profiles.permissions admin_access/manage_team.';

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

COMMENT ON FUNCTION public.can_org_admin_write(uuid, uuid) IS
  'Org-scoped write: in org + fleet staff; NULL org_id => staff only.';

REVOKE ALL ON FUNCTION public.user_belongs_to_org(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_fleet_staff_privileges(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_org_admin_write(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_fleet_staff_privileges(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
