-- =============================================================================
-- מסירה עדיין נחסמת ב-RLS למרות malachiroei — סיבות אפשריות:
-- 1) מיגרציות 126–128 לא הושלמו / פונקציות insert חסרות.
-- 2) WITH CHECK עם EXISTS על vehicles כפוף ל-RLS — בעל פלטפורמה לא רואה רכב בארגון אחר.
-- 3) user_may_cross_org_fleet_read לא תואם למייל ב-auth.users (מייל ב-profiles בלבד).
-- כאן: user_is_fleet_bootstrap_owner (auth.users + profiles), vehicle_exists בלי RLS,
-- ומדינית INSERT נוספת (PERMISSIVE) שכל אחת מהן מספיקה.
-- =============================================================================

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

COMMENT ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) IS
  'Bootstrap fleet owners by auth.users or profiles email (align with fleetBootstrapEmails).';

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

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Delegates to user_is_fleet_bootstrap_owner (auth + profiles email).';

CREATE OR REPLACE FUNCTION public.vehicle_exists_by_id(_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = _vehicle_id);
$$;

COMMENT ON FUNCTION public.vehicle_exists_by_id(uuid) IS
  'RLS helper: vehicle row exists (bypasses vehicles RLS for policy checks).';

REVOKE ALL ON FUNCTION public.vehicle_exists_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vehicle_exists_by_id(uuid) TO authenticated;

DROP POLICY IF EXISTS "vehicle_handovers_insert_bootstrap_owner" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_bootstrap_owner"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND public.user_is_fleet_bootstrap_owner(auth.uid())
  );

NOTIFY pgrst, 'reload schema';
