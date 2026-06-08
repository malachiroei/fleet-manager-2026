-- Driver INSERT RLS helpers — safe to run if 20260607120000 was already applied without drivers section.

CREATE OR REPLACE FUNCTION public.policy_profile_drivers_perm_allow(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        COALESCE((p.permissions ->> 'drivers')::boolean, false)
        OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
        OR COALESCE((p.permissions ->> 'admin_access')::boolean, false)
        OR (jsonb_typeof(p.allowed_features) = 'array' AND (p.allowed_features ? 'drivers'))
      FROM public.profiles p
      WHERE p.id = _uid
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.policy_profile_drivers_perm_allow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_profile_drivers_perm_allow(uuid) TO authenticated;

DROP POLICY IF EXISTS "drivers_insert_drivers_perm" ON public.drivers;
CREATE POLICY "drivers_insert_drivers_perm"
  ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND (
      public.can_org_admin_write(auth.uid(), org_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text IN ('admin', 'fleet_manager')
      )
      OR public.policy_profile_drivers_perm_allow(auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
