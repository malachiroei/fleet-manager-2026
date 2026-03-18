-- Ensure profiles has org_id (used by RLS and app; may already exist).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.org_id IS 'Organization the user belongs to; set from org_invitations when they sign up with an invited email.';

-- When a new user signs up, if their email matches an org_invitations row, assign that org_id and permissions.
-- This ensures invited users get the inviter's org (and only that org) automatically.
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

    -- If this email was invited, assign org_id and permissions from the invitation (most recent by created_at).
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
    END IF;

    -- Default role is viewer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');

    RETURN NEW;
END;
$$;
