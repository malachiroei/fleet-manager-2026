-- Enforce pending_approval as the default status for all new profiles.
-- Invited users still get org_id and permissions, but remain pending_approval
-- until an admin explicitly approves them.

ALTER TABLE public.profiles
  ALTER COLUMN status SET DEFAULT 'pending_approval';

COMMENT ON COLUMN public.profiles.status IS
  'Account status: pending_approval (cannot access data) or active. New users are always pending_approval until an admin approves.';

-- Override handle_new_user so it NEVER sets status to active automatically.
-- It only attaches org_id/permissions from invitations; status stays at the default.

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

