-- =============================================================================
-- הרצה חד-פעמית ב-Supabase SQL Editor אם create_vehicle_handover חסר / PostgREST 404.
-- דורש מראש: user_may_insert_vehicle_handover_row_check + עמודות טבלה (org_id, assignment_mode…).
-- אחרי הרצה: NOTIFY pgrst, 'reload schema';
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_vehicle_handover(
  p_org_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_handover_type text,
  p_assignment_mode text,
  p_handover_date timestamp with time zone,
  p_odometer_reading integer,
  p_fuel_level text,
  p_photo_front_url text,
  p_photo_back_url text,
  p_photo_right_url text,
  p_photo_left_url text,
  p_signature_url text,
  p_notes text,
  p_created_by uuid
)
RETURNS public.vehicle_handovers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result public.vehicle_handovers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_created_by IS NOT NULL AND p_created_by <> uid THEN
    RAISE EXCEPTION 'created_by must match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_may_insert_vehicle_handover_row_check(uid, p_vehicle_id, p_driver_id) THEN
    RAISE EXCEPTION 'insert not permitted for vehicle_handovers'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.vehicle_handovers (
    org_id,
    vehicle_id,
    driver_id,
    handover_type,
    assignment_mode,
    handover_date,
    odometer_reading,
    fuel_level,
    photo_front_url,
    photo_back_url,
    photo_right_url,
    photo_left_url,
    signature_url,
    notes,
    created_by
  )
  VALUES (
    p_org_id,
    p_vehicle_id,
    p_driver_id,
    p_handover_type,
    COALESCE(NULLIF(trim(p_assignment_mode), ''), 'permanent'),
    COALESCE(p_handover_date, now()),
    p_odometer_reading,
    p_fuel_level,
    p_photo_front_url,
    p_photo_back_url,
    p_photo_right_url,
    p_photo_left_url,
    p_signature_url,
    p_notes,
    COALESCE(p_created_by, uid)
  )
  RETURNING * INTO STRICT result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) TO authenticated;

NOTIFY pgrst, 'reload schema';
