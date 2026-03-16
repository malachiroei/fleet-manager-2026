-- Add status column to profiles for account approval flow.
-- Status values:
--   'pending_approval' - newly registered user without invite, blocked from data
--   'active'           - approved/normal account (including invited users)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_approval'
  CHECK (status IN ('pending_approval', 'active'));

COMMENT ON COLUMN public.profiles.status IS
  'Account status: pending_approval (cannot access data) or active.';

-- Update handle_new_user to set status:
-- - Invited users: status = ''active'' once org is assigned
-- - Non-invited users: keep default ''pending_approval''

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
          permissions = COALESCE(inv_permissions, '{}'::jsonb),
          status = 'active'
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

