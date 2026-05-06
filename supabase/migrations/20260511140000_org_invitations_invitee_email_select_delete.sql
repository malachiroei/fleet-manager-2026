-- =============================================================================
-- org_invitations: המוזמן (אימייל = JWT) יכול לקרוא ולמחוק את שורת ההזמנה שלו.
--
-- לפני כן רק can_org_admin_write יכל למחוק — משתמש חדש אחרי הרשמה עדיין לא עומד
-- בתנאי, ולכן השורה נשארה ונראית למנהל תחת «הזמנות פתוחות».
-- SELECT למוזמן נדרש גם לפני ש-profiles.org_id נכנס בגלל סדר הפעולות ב-signUp.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_invitations'
  ) THEN
    DROP POLICY IF EXISTS "org_invitations_select_invitee_email" ON public.org_invitations;
    CREATE POLICY "org_invitations_select_invitee_email"
      ON public.org_invitations FOR SELECT
      TO authenticated
      USING (
        lower(trim(both from coalesce(email, ''))) =
          lower(trim(both from coalesce((auth.jwt() ->> 'email')::text, '')))
        OR lower(trim(both from coalesce(email, ''))) =
          lower(trim(both from coalesce((auth.jwt() -> 'user_metadata' ->> 'email')::text, '')))
      );

    DROP POLICY IF EXISTS "org_invitations_delete_invitee_email" ON public.org_invitations;
    CREATE POLICY "org_invitations_delete_invitee_email"
      ON public.org_invitations FOR DELETE
      TO authenticated
      USING (
        lower(trim(both from coalesce(email, ''))) =
          lower(trim(both from coalesce((auth.jwt() ->> 'email')::text, '')))
        OR lower(trim(both from coalesce(email, ''))) =
          lower(trim(both from coalesce((auth.jwt() -> 'user_metadata' ->> 'email')::text, '')))
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
