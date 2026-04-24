-- הסרת חבר צוות מארגון: מחיקת org_members, עדכון profiles.org_id אם צריך, ניתוק parent/managed מהמנהל המסיר.
-- SECURITY DEFINER — RLS על profiles לא מאפשר להעביר peer ל-org אחר בלי WITH CHECK; כאן מרכזים את הזרימה.

CREATE OR REPLACE FUNCTION public.remove_team_member_from_org(_org_id uuid, _member_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_profile_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _org_id IS NULL OR _member_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid arguments' USING ERRCODE = '22004';
  END IF;
  IF v_caller = _member_user_id THEN
    RAISE EXCEPTION 'cannot remove yourself' USING ERRCODE = '42501';
  END IF;

  IF NOT public.viewer_may_manage_peer_profiles_in_org(v_caller, _org_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.id
  INTO v_caller_profile_id
  FROM public.profiles p
  WHERE p.id = v_caller
     OR p.user_id = v_caller
  LIMIT 1;

  DELETE FROM public.org_members om
  WHERE om.org_id = _org_id
    AND om.user_id = _member_user_id;

  UPDATE public.profiles p
  SET
    updated_at = now(),
    org_id = CASE
      WHEN p.org_id = _org_id THEN (
        SELECT om2.org_id
        FROM public.org_members om2
        WHERE om2.user_id = _member_user_id
        ORDER BY om2.created_at ASC NULLS LAST
        LIMIT 1
      )
      ELSE p.org_id
    END,
    parent_admin_id = CASE
      WHEN v_caller_profile_id IS NOT NULL AND p.parent_admin_id = v_caller_profile_id THEN NULL
      ELSE p.parent_admin_id
    END,
    managed_by_user_id = CASE
      WHEN v_caller_profile_id IS NOT NULL AND p.managed_by_user_id = v_caller_profile_id THEN NULL
      ELSE p.managed_by_user_id
    END
  WHERE p.id = _member_user_id
     OR p.user_id = _member_user_id;
END;
$$;

COMMENT ON FUNCTION public.remove_team_member_from_org(uuid, uuid) IS
  'Team lead removes a user from an org: delete org_members row, repoint profile.org_id if needed, clear parent/managed link to caller.';

REVOKE ALL ON FUNCTION public.remove_team_member_from_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_team_member_from_org(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
