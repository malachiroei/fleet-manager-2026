-- =============================================================================
-- org_invitations.role — נדרש ל-SimpleInviteModal / InviteMemberModal / useAuth signup
-- (admin מול driver). בלי העמודה PostgREST דוחה INSERT והממשק מציג [object Object].
-- =============================================================================

ALTER TABLE public.org_invitations
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'driver';

COMMENT ON COLUMN public.org_invitations.role IS
  'יעד אחרי הרשמה: admin | driver (תואם useAuth.signUp).';

UPDATE public.org_invitations
SET role = 'driver'
WHERE role IS NULL;

NOTIFY pgrst, 'reload schema';
