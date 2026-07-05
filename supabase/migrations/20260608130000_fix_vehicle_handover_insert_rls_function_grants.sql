-- =============================================================================
-- Fix vehicle handover (מסירה) failing with:
--   permission denied for function user_may_insert_vehicle_handover_row_check
--
-- create_vehicle_handover RPC calls row_check; authenticated must have EXECUTE
-- on the helper chain (same pattern as 20260607120000 vehicle insert grants).
-- Safe to re-run.
-- =============================================================================

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_insert_vehicle_handover_as_subject_driver(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.vehicle_exists_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vehicle_exists_by_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_fleet_bootstrap_owner(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.vehicle_handovers TO authenticated;

NOTIFY pgrst, 'reload schema';
