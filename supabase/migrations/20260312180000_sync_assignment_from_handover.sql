-- Ensure driver_vehicle_assignments + vehicles.assigned_driver_id stay in sync with
-- vehicle_handovers for ALL drivers — same behavior as Roi Malachi after every archive.
-- The INSERT trigger already runs on new handovers; this RPC is called from the app
-- after archive so returns always unassign even if driver_id was wrong/null, and
-- deliveries can backfill a missing assignment row without duplicating.

CREATE OR REPLACE FUNCTION public.sync_assignment_from_handover(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT vehicle_id, driver_id, handover_type, assignment_mode, created_by
  INTO r
  FROM public.vehicle_handovers
  WHERE id = p_handover_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- החזרה: מנקה assigned_driver_id ברכב + סוגר כל שורות assignment פתוחות לרכב (מיד כמו אצל רועי)
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

  -- מסירה קבועה: כמו הטריגר — שיוך נהג לרכב + שורת assignment אחת פעילה לרכב
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

  -- מסירה חליפית: רק רישום היסטורי סגור מיד (ללא שיוך קבוע) — כמו בטריגר
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

COMMENT ON FUNCTION public.sync_assignment_from_handover(uuid) IS
  'Syncs vehicles.assigned_driver_id and driver_vehicle_assignments from vehicle_handovers after archive; call from app so all drivers behave like handover-driven assignment.';

-- Allow authenticated clients to invoke after archiving forms
GRANT EXECUTE ON FUNCTION public.sync_assignment_from_handover(uuid) TO authenticated;
