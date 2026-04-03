-- =============================================================================
-- דיווח קילומטראז׳ בפרו: RPC אחד (SECURITY DEFINER) = INSERT mileage_logs +
-- UPDATE vehicles.current_odometer — עוקף כשלי RLS כשהמדיניות לא מסונכרנת.
-- בנוסף: מסיר טריגר http() ישן שלא עובד בלי הרחבה + הגדרות app.settings.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_mileage_report(
  p_vehicle_id uuid,
  p_odometer_value numeric,
  photo_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_org_id uuid;
  v_assign uuid;
  new_log_id uuid;
  may_vehicle boolean;
  may_role boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_vehicle_id IS NULL OR p_odometer_value IS NULL OR p_odometer_value <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  IF p_photo_url IS NULL OR length(trim(p_photo_url)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_photo_url');
  END IF;

  SELECT v.org_id, v.assigned_driver_id
  INTO v_org_id, v_assign
  FROM public.vehicles v
  WHERE v.id = p_vehicle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vehicle_not_found');
  END IF;

  -- Inline platform-owner check (do not call user_may_cross_org_fleet_read — may be missing if 20260402180000 not applied on prod).
  may_vehicle :=
    EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = uid
        AND lower(trim(coalesce(u.email, ''))) = 'malachiroei@gmail.com'
    )
    OR (
      v_org_id IS NOT NULL
      AND public.user_belongs_to_org(uid, v_org_id)
    )
    OR (
      v_org_id IS NULL
      AND public.user_has_fleet_staff_privileges(uid)
    )
    OR EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = v_assign
        AND d.user_id = uid
    )
    OR EXISTS (
      SELECT 1
      FROM public.driver_vehicle_assignments a
      INNER JOIN public.drivers d ON d.id = a.driver_id
      WHERE a.vehicle_id = p_vehicle_id
        AND a.unassigned_at IS NULL
        AND d.user_id = uid
        AND (
          v_org_id IS NULL
          OR public.user_belongs_to_org(uid, v_org_id)
        )
    );

  IF NOT may_vehicle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vehicle_forbidden');
  END IF;

  may_role :=
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = uid
        AND lower(ur.role::text) IN ('admin', 'fleet_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = uid
        AND (
          p.permissions IS NULL
          OR (p.permissions::jsonb) = '{}'::jsonb
          OR (coalesce((p.permissions::jsonb->>'report_mileage')::boolean, false) IS TRUE)
        )
    );

  IF NOT may_role THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_report_permission');
  END IF;

  INSERT INTO public.mileage_logs (vehicle_id, odometer_value, photo_url, user_id)
  VALUES (p_vehicle_id, p_odometer_value, trim(photo_url), uid)
  RETURNING id INTO new_log_id;

  UPDATE public.vehicles v
  SET
    current_odometer = GREATEST(COALESCE(v.current_odometer, 0), ceiling(p_odometer_value)::integer),
    last_odometer_date = CASE
      WHEN ceiling(p_odometer_value)::integer >= COALESCE(v.current_odometer, 0) THEN CURRENT_DATE
      ELSE v.last_odometer_date
    END,
    updated_at = now()
  WHERE v.id = p_vehicle_id;

  RETURN jsonb_build_object('ok', true, 'log_id', new_log_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'database_error', 'detail', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.submit_mileage_report(uuid, numeric, text) IS
  'Authenticated mileage report: log row + bump vehicle odometer (bypasses RLS on tables).';

REVOKE ALL ON FUNCTION public.submit_mileage_report(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mileage_report(uuid, numeric, text) TO authenticated;

DROP TRIGGER IF EXISTS trg_mileage_logs_notify ON public.mileage_logs;
