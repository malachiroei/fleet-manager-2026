-- =============================================================================
-- 42P17: infinite recursion detected in policy for relation "profiles"
--
-- המדיניות profiles_select_same_org_team_manager (וגם profiles_update_same_org_team_manager)
-- השתמשו ב־EXISTS (SELECT … FROM public.profiles m …) מתוך מדיניות על profiles.
-- בדיקת שורת m מפעילה שוב את כל מדיניות ה־SELECT על profiles → לולאה אינסופית.
--
-- פתרון: לוגיקה ב־SECURITY DEFINER שקוראת ל־profiles כבעל הפונקציה (בעל הטבלה עוקף RLS
-- לשאילתות בתוך הפונקציה).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.viewer_may_manage_peer_profiles_in_org(_viewer uuid, _target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer IS NOT NULL
    AND _target_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles m
      WHERE m.id = _viewer
        AND m.org_id IS NOT NULL
        AND m.org_id = _target_org_id
        AND (
          public.is_manager(_viewer)
          OR COALESCE((m.permissions ->> 'manage_team')::boolean, false) = true
        )
    );
$$;

COMMENT ON FUNCTION public.viewer_may_manage_peer_profiles_in_org(uuid, uuid) IS
  'True if _viewer is same-org fleet lead (is_manager or manage_team). Used from profiles RLS without self-join recursion.';

REVOKE ALL ON FUNCTION public.viewer_may_manage_peer_profiles_in_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viewer_may_manage_peer_profiles_in_org(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_select_same_org_team_manager" ON public.profiles;

CREATE POLICY "profiles_select_same_org_team_manager"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.viewer_may_manage_peer_profiles_in_org(auth.uid(), profiles.org_id));

COMMENT ON POLICY "profiles_select_same_org_team_manager" ON public.profiles IS
  'Same-org team leads can list peer profiles (no recursive profiles subquery in policy).';

DROP POLICY IF EXISTS "profiles_update_same_org_team_manager" ON public.profiles;

CREATE POLICY "profiles_update_same_org_team_manager"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.viewer_may_manage_peer_profiles_in_org(auth.uid(), profiles.org_id))
  WITH CHECK (public.viewer_may_manage_peer_profiles_in_org(auth.uid(), profiles.org_id));

COMMENT ON POLICY "profiles_update_same_org_team_manager" ON public.profiles IS
  'Same-org team leads may update peer profiles (no recursive profiles subquery).';

NOTIFY pgrst, 'reload schema';
