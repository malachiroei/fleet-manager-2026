-- Emergency hardening: strict vehicle visibility isolation between peer admins.
-- Run in Supabase SQL Editor.

BEGIN;

-- 1) Cross-org read must remain only for platform owner.
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

-- 2) Remove ALL existing SELECT policies on vehicles (including legacy/unknown names).
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicles'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.vehicles', p.policyname);
  END LOOP;
END $$;

-- 3) Recreate ONE strict policy.
CREATE POLICY "vehicles_select_org_scope"
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    -- platform owner only
    public.user_may_cross_org_fleet_read(auth.uid())
    OR (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND (
        managed_by_user_id IS NULL
        OR managed_by_user_id = auth.uid()
        OR (
          public.user_may_read_managed_fleet_row(auth.uid(), managed_by_user_id)
          AND NOT public.user_has_fleet_staff_privileges(auth.uid())
        )
      )
    )
    OR (
      org_id IS NULL
      AND public.user_has_fleet_staff_privileges(auth.uid())
    )
  );

COMMIT;

-- Verify:
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='vehicles'
-- ORDER BY policyname;
