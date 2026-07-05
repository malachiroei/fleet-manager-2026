-- =============================================================================
-- אחרי ארכוב מסירה: permission denied for function sync_assignment_from_handover
-- (code 42501). הפונקציה קיימת מ-20260312180000 אך EXECUTE ל-authenticated חסר בפרו.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_assignment_from_handover(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT vehicle_id, driver_id, handover_type, assignment_mode, created_by
  INTO r
  FROM public.vehicle_handovers
  WHERE id = p_handover_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.user_may_access_vehicle_handover_row(uid, p_handover_id) THEN
    RAISE EXCEPTION 'sync_assignment_from_handover not permitted'
      USING ERRCODE = '42501';
  END IF;

  IF r.handover_type = 'return' THEN
    UPDATE public.vehicles
    SET assigned_driver_id = NULL, updated_at = now()
    WHERE id = r.vehicle_id;

    UPDATE public.driver_vehicle_assignments
    SET unassigned_at = now()
    WHERE vehicle_id = r.vehicle_id
      AND unassigned_at IS NULL;

    RETURN;
  END IF;

  IF r.handover_type = 'delivery' AND r.driver_id IS NOT NULL
     AND COALESCE(r.assignment_mode, 'permanent') = 'permanent' THEN

    UPDATE public.vehicles
    SET assigned_driver_id = r.driver_id, updated_at = now()
    WHERE id = r.vehicle_id;

    UPDATE public.driver_vehicle_assignments
    SET unassigned_at = now()
    WHERE vehicle_id = r.vehicle_id
      AND unassigned_at IS NULL;

    INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes)
    VALUES (
      r.vehicle_id,
      r.driver_id,
      r.created_by,
      'שיוך אוטומטי ממסירה (סנכרון לאחר ארכוב)'
    );
    RETURN;
  END IF;

  IF r.handover_type = 'delivery' AND r.driver_id IS NOT NULL
     AND COALESCE(r.assignment_mode, 'permanent') = 'replacement' THEN
    INSERT INTO public.driver_vehicle_assignments (
      vehicle_id, driver_id, assigned_by, notes, unassigned_at
    )
    VALUES (
      r.vehicle_id,
      r.driver_id,
      r.created_by,
      'מסירת רכב חליפי (סנכרון לאחר ארכוב)',
      now()
    );
  END IF;
END;
$$;

ALTER FUNCTION public.sync_assignment_from_handover(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.sync_assignment_from_handover(uuid) IS
  'Syncs vehicles.assigned_driver_id + driver_vehicle_assignments after handover archive.';

REVOKE ALL ON FUNCTION public.sync_assignment_from_handover(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_assignment_from_handover(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_access_vehicle_handover_row(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
