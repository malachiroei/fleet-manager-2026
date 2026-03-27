-- Allow fleet users with manage_team (same org) to SELECT peer profiles, not only is_manager().
-- Fixes team page: invited users who signed up appear in profiles but were invisible to org managers
-- who are not admin/fleet_manager in user_roles.

CREATE POLICY "profiles_select_same_org_team_manager"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles m
      WHERE m.id = auth.uid()
      AND m.org_id IS NOT NULL
      AND profiles.org_id IS NOT NULL
      AND m.org_id = profiles.org_id
      AND (
        public.is_manager(auth.uid())
        OR COALESCE((m.permissions ->> 'manage_team')::boolean, false) = true
      )
    )
  );

COMMENT ON POLICY "profiles_select_same_org_team_manager" ON public.profiles IS
  'Same-org team leads can list profiles for ניהול צוות (in addition to global is_manager policy).';
