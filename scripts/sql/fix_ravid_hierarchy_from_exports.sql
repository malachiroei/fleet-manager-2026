-- Project: hojopkvnajvexnwolyeu
-- Goal:
-- 1) Roei (platform owner) sees all
-- 2) Ravid is admin of org 2bb0f9c3-b210-4099-b0c5-de92794d5cc9
-- 3) arik + malachiroei1 are regular users under Ravid only

DO $$
DECLARE
  v_org_ravid constant uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
  v_roei uuid;
  v_ravid uuid;
  v_arik uuid;
  v_mal1 uuid;
BEGIN
  SELECT id INTO v_roei
  FROM public.profiles
  WHERE lower(trim(email)) = 'malachiroei@gmail.com'
  LIMIT 1;

  SELECT id INTO v_ravid
  FROM public.profiles
  WHERE lower(trim(email)) IN ('ravidmalachi@gmail.com', 'ravid.malachi@gmail.com')
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  SELECT id INTO v_arik
  FROM public.profiles
  WHERE lower(trim(email)) = 'arikzohargold@gmail.com'
  LIMIT 1;

  SELECT id INTO v_mal1
  FROM public.profiles
  WHERE lower(trim(email)) = 'malachiroei1@gmail.com'
  LIMIT 1;

  IF v_roei IS NULL OR v_ravid IS NULL THEN
    RAISE EXCEPTION 'Missing core profiles (roei=% ravid=%)', v_roei, v_ravid;
  END IF;

  -- Ravid admin under Roei owner.
  UPDATE public.profiles
  SET
    org_id = v_org_ravid,
    parent_admin_id = v_roei,
    managed_by_user_id = v_roei,
    permissions = COALESCE(permissions, '{}'::jsonb) || '{"manage_team": true, "admin_access": true, "report_mileage": true}'::jsonb,
    status = 'active',
    updated_at = now()
  WHERE id = v_ravid;

  -- Managed users under Ravid (if they exist).
  UPDATE public.profiles
  SET
    org_id = v_org_ravid,
    parent_admin_id = v_ravid,
    managed_by_user_id = v_ravid,
    permissions = '{
      "vehicles": true,
      "drivers": true,
      "handover": true,
      "vehicle_delivery": true,
      "replacement_car": true,
      "procedure6_complaints": true,
      "mileage_update": true,
      "report_mileage": true,
      "reports": true,
      "forms": true,
      "compliance": true,
      "maintenance": true,
      "manage_team": false,
      "edit_rights": true,
      "delete_rights": false,
      "admin_access": false
    }'::jsonb,
    status = 'active',
    updated_at = now()
  WHERE id IN (v_arik, v_mal1);

  -- IMPORTANT: remove cross-org memberships for managed users; keep only Ravid org.
  DELETE FROM public.org_members
  WHERE user_id IN (v_arik, v_mal1)
    AND org_id <> v_org_ravid;

  -- Ravid should also be member only of his own org in this model.
  DELETE FROM public.org_members
  WHERE user_id = v_ravid
    AND org_id <> v_org_ravid;

  -- Ensure required org_members rows exist.
  INSERT INTO public.org_members (user_id, org_id)
  SELECT x.user_id, v_org_ravid
  FROM (
    SELECT v_ravid AS user_id
    UNION ALL SELECT v_arik
    UNION ALL SELECT v_mal1
  ) x
  WHERE x.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.org_members om
      WHERE om.user_id = x.user_id
        AND om.org_id = v_org_ravid
    );

  -- user_roles sync.
  INSERT INTO public.user_roles (user_id, role)
  SELECT v_ravid, 'admin'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_ravid
      AND lower(ur.role) = 'admin'
  );

  DELETE FROM public.user_roles
  WHERE user_id = v_ravid
    AND lower(role) IN ('driver', 'viewer', 'employee');

  INSERT INTO public.user_roles (user_id, role)
  SELECT x.user_id, 'driver'
  FROM (
    SELECT v_arik AS user_id
    UNION ALL SELECT v_mal1
  ) x
  WHERE x.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = x.user_id
        AND lower(ur.role) = 'driver'
    );

  DELETE FROM public.user_roles ur
  WHERE ur.user_id IN (v_arik, v_mal1)
    AND lower(ur.role) IN ('admin', 'fleet_manager');

  -- Invitations: keep pending invites aligned to Ravid org and inviter.
  UPDATE public.org_invitations
  SET
    org_id = v_org_ravid,
    invited_by = v_ravid
  WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
    AND coalesce(lower(status), 'pending') = 'pending';

  -- Optional hard cleanup: remove stale duplicate pending invites for Arik.
  DELETE FROM public.org_invitations oi
  USING (
    SELECT id,
           row_number() OVER (
             PARTITION BY lower(trim(email))
             ORDER BY created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM public.org_invitations
    WHERE lower(trim(email)) IN ('arikzohargold@gmail.com', 'malachiroei1@gmail.com')
      AND coalesce(lower(status), 'pending') = 'pending'
  ) d
  WHERE oi.id = d.id
    AND d.rn > 1;
END $$;

NOTIFY pgrst, 'reload schema';
