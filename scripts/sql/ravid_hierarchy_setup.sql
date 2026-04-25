-- Project: hojopkvnajvexnwolyeu
-- Purpose: set org hierarchy Roei -> Ravid -> members and sync invitations.

DO $$
DECLARE
  ravid_id uuid;
  roei_owner_id uuid;
  ravid_org_id constant uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
BEGIN
  SELECT id INTO ravid_id
  FROM public.profiles
  WHERE lower(trim(email)) IN ('ravidmalachi@gmail.com', 'ravid.malachi@gmail.com')
  LIMIT 1;

  SELECT id INTO roei_owner_id
  FROM public.profiles
  WHERE lower(trim(email)) = 'malachiroei@gmail.com'
  LIMIT 1;

  IF ravid_id IS NULL OR roei_owner_id IS NULL THEN
    RAISE EXCEPTION 'Missing required profiles: ravid_id=% roei_owner_id=%', ravid_id, roei_owner_id;
  END IF;

  UPDATE public.profiles
  SET parent_admin_id = roei_owner_id,
      managed_by_user_id = roei_owner_id,
      org_id = ravid_org_id,
      status = 'active',
      updated_at = now()
  WHERE id = ravid_id;

  UPDATE public.profiles
  SET managed_by_user_id = ravid_id,
      parent_admin_id = ravid_id,
      org_id = ravid_org_id,
      status = 'active',
      updated_at = now()
  WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com');

  INSERT INTO public.org_members (user_id, org_id)
  SELECT p.id, ravid_org_id
  FROM public.profiles p
  WHERE p.id = ravid_id
     OR lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  ON CONFLICT (user_id, org_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (ravid_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = ravid_id
    AND lower(role) IN ('driver', 'viewer', 'employee');

  INSERT INTO public.user_roles (user_id, role)
  SELECT p.id, 'driver'
  FROM public.profiles p
  WHERE lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles ur
  USING public.profiles p
  WHERE ur.user_id = p.id
    AND lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    AND lower(ur.role) IN ('admin', 'fleet_manager');

  UPDATE public.org_invitations
  SET org_id = ravid_org_id
  WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    AND coalesce(lower(status), 'pending') = 'pending';
END $$;

