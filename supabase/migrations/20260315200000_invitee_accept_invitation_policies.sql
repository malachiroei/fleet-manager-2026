-- Allow invitees to see and delete their own invitation (by matching email).
-- This lets a user who was invited accept the invite: SELECT their row, update their profile, then DELETE the invitation.

CREATE POLICY "org_invitations_select_by_invitee_email"
  ON public.org_invitations FOR SELECT
  TO authenticated
  USING (
    lower(trim(email)) = (
      SELECT lower(trim(email)) FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_invitations_delete_by_invitee_email"
  ON public.org_invitations FOR DELETE
  TO authenticated
  USING (
    lower(trim(email)) = (
      SELECT lower(trim(email)) FROM public.profiles WHERE user_id = auth.uid()
    )
  );
