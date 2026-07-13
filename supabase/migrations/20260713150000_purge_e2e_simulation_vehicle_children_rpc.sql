-- E2E simulation cleanup: delete vehicle child rows that authenticated clients cannot
-- DELETE (mileage_logs, vehicle_service_logs — INSERT-only grants + no DELETE policy).
--
-- Fix: only DELETE from tables that actually have a vehicle_id column (42703 guard).

CREATE OR REPLACE FUNCTION public.purge_e2e_simulation_vehicle_children(
  p_org_id uuid,
  p_vehicle_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer := 0;
  v_n integer;
  v_table text;
  -- Known fleet child tables from migrations (NOT speculative audit/history guesses)
  v_vehicle_id_tables text[] := ARRAY[
    'vehicle_documents',
    'maintenance_records',
    'maintenance_logs',
    'vehicle_service_logs',
    'mileage_logs',
    'vehicle_expenses',
    'vehicle_incidents',
    'driver_vehicle_assignments',
    'vehicle_handovers'
  ];
BEGIN
  IF v_uid IS NULL OR p_org_id IS NULL OR p_vehicle_ids IS NULL OR cardinality(p_vehicle_ids) = 0 THEN
    RETURN 0;
  END IF;

  IF NOT public.can_org_admin_write(v_uid, p_org_id) THEN
    RAISE EXCEPTION 'permission denied for purge_e2e_simulation_vehicle_children';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_vehicle_ids) AS vid(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.vehicles v WHERE v.id = vid.id AND v.org_id = p_org_id
    )
  ) THEN
    RAISE EXCEPTION 'vehicle org mismatch';
  END IF;

  -- Nullable reverse FK: driver_incidents.vehicle_id (ON DELETE SET NULL pattern)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'driver_incidents' AND column_name = 'vehicle_id'
  ) THEN
    UPDATE public.driver_incidents SET vehicle_id = NULL WHERE vehicle_id = ANY(p_vehicle_ids);
  END IF;

  -- Nullable reverse FK: compliance_alerts.vehicle_id (only on some prod schemas)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'compliance_alerts' AND column_name = 'vehicle_id'
  ) THEN
    UPDATE public.compliance_alerts SET vehicle_id = NULL WHERE vehicle_id = ANY(p_vehicle_ids);
  END IF;

  UPDATE public.drivers
  SET assigned_vehicle_id = NULL
  WHERE org_id = p_org_id AND assigned_vehicle_id = ANY(p_vehicle_ids);

  UPDATE public.vehicles
  SET assigned_driver_id = NULL
  WHERE org_id = p_org_id AND id = ANY(p_vehicle_ids);

  -- Child tables keyed by vehicle_id (skip if table or column missing)
  FOREACH v_table IN ARRAY v_vehicle_id_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = v_table
           AND column_name = 'vehicle_id'
       )
    THEN
      EXECUTE format('DELETE FROM public.%I WHERE vehicle_id = ANY($1)', v_table)
        USING p_vehicle_ids;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total := v_total + v_n;
    END IF;
  END LOOP;

  -- compliance_alerts uses entity_type + entity_id (NOT vehicle_id)
  IF to_regclass('public.compliance_alerts') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'compliance_alerts'
         AND column_name = 'entity_id'
     )
  THEN
    DELETE FROM public.compliance_alerts
    WHERE entity_type = 'vehicle' AND entity_id = ANY(p_vehicle_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;

  -- compliance_requests uses entity_type + entity_id (NOT vehicle_id)
  IF to_regclass('public.compliance_requests') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'compliance_requests'
         AND column_name = 'entity_id'
     )
  THEN
    DELETE FROM public.compliance_requests
    WHERE org_id = p_org_id
      AND entity_type = 'vehicle'
      AND entity_id = ANY(p_vehicle_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.purge_e2e_simulation_vehicle_children(uuid, uuid[]) IS
  'E2E simulation cleanup: removes vehicle child rows (incl. mileage_logs) for org admins; skips tables without vehicle_id.';

REVOKE ALL ON FUNCTION public.purge_e2e_simulation_vehicle_children(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_e2e_simulation_vehicle_children(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
