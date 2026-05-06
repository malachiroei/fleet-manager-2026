-- =============================================================================
-- Fix: platform owner (malachiroei) must be able to list tenant admins.
-- The UI query `useTenantFleetAdminsForPlatformSwitcher` filters profiles by
-- roles (admin/fleet_manager). If RLS on public.user_roles only allows
-- SELECT own roles, the platform owner cannot see anyone -> empty list.
--
-- This policy is intentionally narrow: only the platform super owner as
-- defined by user_may_cross_org_fleet_read() may read user_roles cross-org.
-- =============================================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_select_platform_owner" ON public.user_roles;

CREATE POLICY "user_roles_select_platform_owner"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.user_may_cross_org_fleet_read(auth.uid()));

COMMENT ON POLICY "user_roles_select_platform_owner" ON public.user_roles IS
  'Platform owner may SELECT user_roles across orgs (admin switcher/team lists).';

NOTIFY pgrst, 'reload schema';

