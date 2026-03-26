-- org_members: which organizations a user belongs to (for multi-org switcher).
-- profiles.org_id remains the "primary" org; org_members is the source of truth for "all orgs I belong to".
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members (org_id);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Users can read their own memberships.
CREATE POLICY "org_members_select_own"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own row (e.g. when accepting an invite).
CREATE POLICY "org_members_insert_own"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Backfill: every profile with org_id gets a row in org_members.
INSERT INTO public.org_members (user_id, org_id)
  SELECT user_id, org_id FROM public.profiles WHERE org_id IS NOT NULL
  ON CONFLICT (user_id, org_id) DO NOTHING;

-- When handle_new_user assigns org from invitation, also add to org_members.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_org_id uuid;
  inv_permissions jsonb;
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'), NEW.email);

    SELECT oi.org_id, oi.permissions
    INTO inv_org_id, inv_permissions
    FROM public.org_invitations oi
    WHERE lower(trim(oi.email)) = lower(trim(NEW.email))
    ORDER BY oi.created_at DESC
    LIMIT 1;

    IF inv_org_id IS NOT NULL THEN
      UPDATE public.profiles
      SET org_id = inv_org_id,
          permissions = COALESCE(inv_permissions, '{}'::jsonb)
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
