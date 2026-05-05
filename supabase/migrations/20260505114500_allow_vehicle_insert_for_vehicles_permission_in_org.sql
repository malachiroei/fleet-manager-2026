-- Fix: users with vehicles permission (e.g. Eric) cannot add vehicles due to
-- admin-only insert policy on public.vehicles.
-- This policy allows INSERT when user belongs to the target org and has
-- profile.permissions.vehicles = true.

DROP POLICY IF EXISTS "vehicles_insert_with_vehicles_permission" ON public.vehicles;

CREATE POLICY "vehicles_insert_with_vehicles_permission"
  ON public.vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND public.user_belongs_to_org(auth.uid(), org_id)
    AND (
      public.can_org_admin_write(auth.uid(), org_id)
      OR managed_by_user_id = auth.uid()
      OR (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (
              COALESCE((p.permissions ->> 'vehicles')::boolean, false)
              OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
              OR COALESCE((p.permissions ->> 'admin_access')::boolean, false)
              OR (jsonb_typeof(p.allowed_features) = 'array' AND p.allowed_features ? 'vehicles')
            )
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text IN ('admin', 'fleet_manager')
      )
    )
  );

COMMENT ON POLICY "vehicles_insert_with_vehicles_permission" ON public.vehicles IS
  'Allow org member vehicle insert via admin write OR self-managed row OR vehicles permission/role.';
