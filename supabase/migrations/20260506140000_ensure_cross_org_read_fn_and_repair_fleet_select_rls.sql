-- =============================================================================
-- תיקון סביבות שלא הריצו מיגרציות קודמות: user_may_cross_org_fleet_read חסרה
-- ואז 20260505120000 נכשל. כאן יוצרים את הפונקציה ואז מיישרים SELECT לרכבים/נהגים.
-- גם מסירים פוליסיות מותאמות אישית (vehicles_managed_access וכו') אם נוספו — RLS
-- מצטבר ב-OR; חובה להסיר כפילויות.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
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
  );
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Platform bootstrap owners may cross-org fleet read (align with fleetBootstrapEmails OWNERS).';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_may_read_managed_fleet_row(
  _viewer_id uuid,
  _managed_by_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _managed_by_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _viewer_id
        AND (
          p.parent_admin_id = _managed_by_user_id
          OR p.managed_by_user_id = _managed_by_user_id
        )
    );
$$;

COMMENT ON FUNCTION public.user_may_read_managed_fleet_row(uuid, uuid) IS
  'Delegate may read fleet rows owned by their parent/manager (profiles.parent_admin_id or managed_by_user_id).';

REVOKE ALL ON FUNCTION public.user_may_read_managed_fleet_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_read_managed_fleet_row(uuid, uuid) TO authenticated;

-- הסרת פוליסיות מזיקות / כפולות (שמות שנוספו ידנית או ישנים)
DROP POLICY IF EXISTS "vehicles_managed_access" ON public.vehicles;
DROP POLICY IF EXISTS "drivers_managed_access" ON public.drivers;
DROP POLICY IF EXISTS "vehicles_global_org_access" ON public.vehicles;
DROP POLICY IF EXISTS "drivers_global_org_access" ON public.drivers;

DROP POLICY IF EXISTS "vehicles_select_org_scope" ON public.vehicles;
DROP POLICY IF EXISTS "drivers_select_org_scope" ON public.drivers;

CREATE POLICY "vehicles_select_org_scope"
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
      )
    )
    OR (
      org_id IS NULL
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  );

COMMENT ON POLICY "vehicles_select_org_scope" ON public.vehicles IS
  'Org: shared NULL managed_by, own managed_by, or delegate of owner; not peer admins.';

CREATE POLICY "drivers_select_org_scope"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
      )
    )
    OR (
      public.has_role(auth.uid(), 'viewer'::public.app_role)
      AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
      )
    )
  );

COMMENT ON POLICY "drivers_select_org_scope" ON public.drivers IS
  'Org: shared NULL, own managed_by, delegate of owner; fleet_staff no longer bypasses peer rows.';

NOTIFY pgrst, 'reload schema';
