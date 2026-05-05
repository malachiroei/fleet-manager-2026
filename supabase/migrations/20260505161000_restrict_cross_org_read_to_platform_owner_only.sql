-- Critical isolation fix:
-- Ravid was included in cross-org read helper, which breaks strict separation
-- between peer admins in shared org scenarios.
-- Keep cross-org read only for the platform super owner.

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
  );
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Only platform super owner may cross-org fleet read.';

REVOKE ALL ON FUNCTION public.user_may_cross_org_fleet_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_cross_org_fleet_read(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
