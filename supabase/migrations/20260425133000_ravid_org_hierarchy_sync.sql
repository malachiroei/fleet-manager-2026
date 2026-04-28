-- Establish org hierarchy: Roei (platform owner) -> Ravid (admin) -> managed members.
-- Project ref: hojopkvnajvexnwolyeu

DO $$
DECLARE
  v_ravid_id uuid;
  v_roei_owner_id uuid;
  v_ravid_org_id constant uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
  v_has_profiles_status boolean;
  v_has_org_invitations_status boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
  )
  INTO v_has_profiles_status;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'org_invitations' AND column_name = 'status'
  )
  INTO v_has_org_invitations_status;

  SELECT p.id
  INTO v_ravid_id
  FROM public.profiles p
  WHERE lower(trim(p.email)) IN ('ravidmalachi@gmail.com', 'ravid.malachi@gmail.com')
  ORDER BY p.updated_at DESC NULLS LAST
  LIMIT 1;

  SELECT p.id
  INTO v_roei_owner_id
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'malachiroei@gmail.com'
  LIMIT 1;

  IF v_ravid_id IS NULL THEN
    RAISE EXCEPTION 'Ravid profile not found';
  END IF;
  IF v_roei_owner_id IS NULL THEN
    RAISE EXCEPTION 'Roei owner profile not found';
  END IF;

  -- Ravid: org admin under Roei owner.
  IF v_has_profiles_status THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET
        parent_admin_id = $1,
        managed_by_user_id = $1,
        org_id = $2,
        status = 'active',
        updated_at = now()
      WHERE id = $3
    $sql$
    USING v_roei_owner_id, v_ravid_org_id, v_ravid_id;
  ELSE
    EXECUTE $sql$
      UPDATE public.profiles
      SET
        parent_admin_id = $1,
        managed_by_user_id = $1,
        org_id = $2,
        updated_at = now()
      WHERE id = $3
    $sql$
    USING v_roei_owner_id, v_ravid_org_id, v_ravid_id;
  END IF;

  -- Optional compatibility: update profiles.role if column exists.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    EXECUTE format(
      'UPDATE public.profiles SET role = %L, updated_at = now() WHERE id = %L::uuid',
      'admin',
      v_ravid_id::text
    );
  END IF;

  -- Managed members under Ravid.
  IF v_has_profiles_status THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET
        managed_by_user_id = $1,
        parent_admin_id = $1,
        org_id = $2,
        status = 'active',
        updated_at = now()
      WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    $sql$
    USING v_ravid_id, v_ravid_org_id;
  ELSE
    EXECUTE $sql$
      UPDATE public.profiles
      SET
        managed_by_user_id = $1,
        parent_admin_id = $1,
        org_id = $2,
        updated_at = now()
      WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    $sql$
    USING v_ravid_id, v_ravid_org_id;
  END IF;

  -- Optional compatibility: update profiles.role if exists.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET role = 'driver', updated_at = now()
      WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    $sql$;
  END IF;

  -- Ensure org_members for manager + managed users.
  INSERT INTO public.org_members (user_id, org_id)
  SELECT p.id, v_ravid_org_id
  FROM public.profiles p
  WHERE p.id = v_ravid_id
     OR lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  ON CONFLICT (user_id, org_id) DO NOTHING;

  -- Sync user_roles to requested structure.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_ravid_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = v_ravid_id
    AND lower(role::text) IN ('driver', 'viewer', 'employee');

  INSERT INTO public.user_roles (user_id, role)
  SELECT p.id, 'driver'
  FROM public.profiles p
  WHERE lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles ur
  USING public.profiles p
  WHERE ur.user_id = p.id
    AND lower(trim(p.email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    AND lower(ur.role::text) IN ('admin', 'fleet_manager');

  -- Invitations still pending should point to Ravid org.
  IF v_has_org_invitations_status THEN
    EXECUTE $sql$
      UPDATE public.org_invitations
      SET org_id = $1
      WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
        AND coalesce(lower(status::text), 'pending') = 'pending'
    $sql$
    USING v_ravid_org_id;
  ELSE
    EXECUTE $sql$
      UPDATE public.org_invitations
      SET org_id = $1
      WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    $sql$
    USING v_ravid_org_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
