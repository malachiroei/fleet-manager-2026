-- =============================================================================
-- Supabase linter ERROR: rls_references_user_metadata
-- Policy vehicle_handovers_insert_jwt_bootstrap_email references auth.jwt()
-- user_metadata — editable by end users, must not be used in RLS.
--
-- Fix: use verified email claim only (auth.jwt() ->> 'email'). Bootstrap owners
-- are already covered by user_is_fleet_bootstrap_owner policy + is_platform_super_admin.
-- =============================================================================

DROP POLICY IF EXISTS "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_jwt_bootstrap_email"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
      'malachiroei@gmail.com',
      'ravidmalachi@gmail.com',
      'ravid.malachi@gmail.com'
    )
  );

COMMENT ON POLICY "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers IS
  'Bootstrap emails via verified JWT email claim only (no user_metadata — linter 0015).';

-- row_check inside RPC: remove user_metadata branch for consistency
CREATE OR REPLACE FUNCTION public.user_may_insert_vehicle_handover_row_check(
  _user_id uuid,
  _vehicle_id uuid,
  _driver_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.user_may_insert_vehicle_handover(_user_id, _vehicle_id)
      OR (
        _driver_id IS NOT NULL
        AND public.user_may_insert_vehicle_handover_as_subject_driver(
          _user_id,
          _vehicle_id,
          _driver_id
        )
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND public.user_is_fleet_bootstrap_owner(_user_id)
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
          'malachiroei@gmail.com',
          'ravidmalachi@gmail.com',
          'ravid.malachi@gmail.com'
        )
      )
    );
$$;

NOTIFY pgrst, 'reload schema';
