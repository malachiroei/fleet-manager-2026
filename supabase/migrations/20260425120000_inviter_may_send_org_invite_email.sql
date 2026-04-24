-- הרשאת שליחת מייל הזמנה (Edge send-invite): viewer_may_manage_peer_profiles_in_org דורשת
-- is_manager מ-user_roles או manage_team ב-JSON — בפרו לעיתים יש admin ב-UI בלי שורות ב-user_roles.
-- פונקציה ייעודית: אותה לוגיקה + חברות בארגון עם תפקיד DB + בעלי צי ידועים לפי אימייל.

CREATE OR REPLACE FUNCTION public.inviter_may_send_org_invite_email(_viewer uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer IS NOT NULL
    AND _org_id IS NOT NULL
    AND (
      public.viewer_may_manage_peer_profiles_in_org(_viewer, _org_id)
      OR (
        public.is_manager(_viewer)
        AND (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _viewer AND p.org_id = _org_id)
          OR EXISTS (
            SELECT 1 FROM public.org_members om WHERE om.user_id = _viewer AND om.org_id = _org_id
          )
        )
      )
      OR (
        EXISTS (
          SELECT 1
          FROM auth.users u
          INNER JOIN public.profiles p ON p.id = u.id
          WHERE u.id = _viewer
            AND (
              p.org_id = _org_id
              OR EXISTS (
                SELECT 1 FROM public.org_members om WHERE om.user_id = _viewer AND om.org_id = _org_id
              )
            )
            AND lower(trim(COALESCE(u.email::text, p.email, ''))) IN (
              'malachiroei@gmail.com',
              'ravidmalachi@gmail.com',
              'ravid.malachi@gmail.com'
            )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.inviter_may_send_org_invite_email(uuid, uuid) IS
  'Who may trigger send-invite: team leads (viewer_may_manage), DB admin/manager in org, or known fleet-owner emails in that org.';

REVOKE ALL ON FUNCTION public.inviter_may_send_org_invite_email(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inviter_may_send_org_invite_email(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inviter_may_send_org_invite_email(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
