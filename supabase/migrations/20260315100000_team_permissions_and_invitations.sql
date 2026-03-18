-- Add permissions column to profiles (JSON object of permission keys -> boolean)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

COMMENT ON COLUMN public.profiles.permissions IS 'JSON object e.g. {"vehicles": true, "drivers": true, "manage_team": true}';

-- Table for pending invitations (Fleet Manager invites by email + permissions)
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  permissions jsonb DEFAULT '{}',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invitations_select_own_org"
  ON public.org_invitations FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_invitations_insert_own_org"
  ON public.org_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_invitations_delete_own_org"
  ON public.org_invitations FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );
