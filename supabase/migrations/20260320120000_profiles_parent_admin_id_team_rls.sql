-- Hierarchy: direct manager link (nullable = top-level in org tree).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.parent_admin_id IS 'מנהל ישיר בהיררכיה; NULL = ללא הורה (רמת על בארגון).';

-- Team managers may update peers in the same org (permissions, allowed_features, target_version, parent_admin_id).
DROP POLICY IF EXISTS "profiles_update_same_org_team_manager" ON public.profiles;
CREATE POLICY "profiles_update_same_org_team_manager"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles m
      WHERE m.id = auth.uid()
      AND m.org_id = profiles.org_id
      AND (
        public.is_manager(auth.uid())
        OR COALESCE((m.permissions ->> 'manage_team')::boolean, false) = true
      )
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles m
      WHERE m.id = auth.uid()
      AND m.org_id = profiles.org_id
      AND (
        public.is_manager(auth.uid())
        OR COALESCE((m.permissions ->> 'manage_team')::boolean, false) = true
      )
    )
  );

-- Signup from invitation: set parent_admin_id from inviter (invited_by = auth uid = profiles.id).
-- Must stay aligned with pending_approval + org_members (see 20260316120000).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_org_id uuid;
  inv_permissions jsonb;
  inv_parent uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'),
    NEW.email,
    'pending_approval'
  );

  SELECT oi.org_id, oi.permissions, oi.invited_by
  INTO inv_org_id, inv_permissions, inv_parent
  FROM public.org_invitations oi
  WHERE lower(trim(oi.email)) = lower(trim(NEW.email))
  ORDER BY oi.created_at DESC
  LIMIT 1;

  IF inv_org_id IS NOT NULL THEN
    UPDATE public.profiles
    SET org_id = inv_org_id,
        permissions = COALESCE(inv_permissions, '{}'::jsonb),
        parent_admin_id = inv_parent
    WHERE user_id = NEW.id;

    INSERT INTO public.org_members (user_id, org_id)
    VALUES (NEW.id, inv_org_id)
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer');

  RETURN NEW;
END;
$$;
