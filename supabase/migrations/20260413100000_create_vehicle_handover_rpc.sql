-- =============================================================================
-- מסירה: INSERT ישיר ל-postgrest עדיין 42501 למרות מדיניות — לעיתים הערכת
-- WITH CHECK / auth.jwt() / סדר שונה מסטייג'ינג. RPC SECURITY DEFINER מרכז
-- את אותה לוגיקה כמו שלוש מדיניות ה-INSERT, מבצע INSERT (בעלים עוקף RLS),
-- אחרי אימות מפורש בלבד.
-- =============================================================================

ALTER TABLE public.vehicle_handovers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

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
      (
        public.user_may_insert_vehicle_handover(_user_id, _vehicle_id)
        OR (
          _driver_id IS NOT NULL
          AND public.user_may_insert_vehicle_handover_as_subject_driver(
            _user_id,
            _vehicle_id,
            _driver_id
          )
        )
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND public.user_is_fleet_bootstrap_owner(_user_id)
      )
      OR (
        public.vehicle_exists_by_id(_vehicle_id)
        AND (
          lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
            'malachiroei@gmail.com',
            'ravidmalachi@gmail.com'
          )
          OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) IN (
            'malachiroei@gmail.com',
            'ravidmalachi@gmail.com'
          )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) IS
  'Single gate for handover INSERT (mirrors permissive INSERT policies). Used by create_vehicle_handover RPC.';

REVOKE ALL ON FUNCTION public.user_may_insert_vehicle_handover_row_check(uuid, uuid, uuid) FROM PUBLIC;

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

COMMENT ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) IS
  'Creates vehicle_handovers row after same checks as RLS INSERT policies; bypasses table RLS post-check.';

REVOKE ALL ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_vehicle_handover(
  uuid, uuid, uuid, text, text, timestamp with time zone, integer, text,
  text, text, text, text, text, text, uuid
) TO authenticated;

NOTIFY pgrst, 'reload schema';
