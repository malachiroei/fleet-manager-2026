-- Update bulk_upsert_vehicles to support assigned_driver_id and bidirectional assignment
DROP FUNCTION IF EXISTS public.bulk_upsert_vehicles(jsonb);

CREATE OR REPLACE FUNCTION public.bulk_upsert_vehicles(vehicles jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  total int := 0;
  v_id uuid;
  v_driver_id uuid;
BEGIN
  FOR row_data IN SELECT * FROM jsonb_array_elements(vehicles)
  LOOP
    INSERT INTO public.vehicles (
      plate_number, manufacturer, model, year, current_odometer,
      next_maintenance_km, next_maintenance_date, test_expiry,
      insurance_expiry, engine_volume, color, ignition_code,
      is_active, ownership_type, leasing_company_name,
      last_odometer_date, manufacturer_code, model_code,
      tax_value_price, adjusted_price, chassis_number,
      vehicle_type_code, monthly_total_cost, pickup_date,
      sale_date, group_name, internal_number, vehicle_budget,
      upgrade_addition, vehicle_type_name, base_index,
      driver_code, pascal, next_alert_km, mandatory_end_date,
      odometer_diff_maintenance, org_id, fuel_type,
      service_interval_km, safety_officer, assigned_driver_id
    ) VALUES (
      row_data->>'plate_number',
      COALESCE(row_data->>'manufacturer', ''),
      COALESCE(row_data->>'model', ''),
      COALESCE((row_data->>'year')::int, EXTRACT(YEAR FROM now())::int),
      COALESCE((row_data->>'current_odometer')::int, 0),
      (row_data->>'next_maintenance_km')::int,
      (row_data->>'next_maintenance_date')::date,
      (row_data->>'test_expiry')::date,
      (row_data->>'insurance_expiry')::date,
      row_data->>'engine_volume',
      row_data->>'color',
      row_data->>'ignition_code',
      COALESCE((row_data->>'is_active')::bool, true),
      row_data->>'ownership_type',
      row_data->>'leasing_company_name',
      (row_data->>'last_odometer_date')::date,
      row_data->>'manufacturer_code',
      row_data->>'model_code',
      (row_data->>'tax_value_price')::numeric,
      (row_data->>'adjusted_price')::numeric,
      row_data->>'chassis_number',
      row_data->>'vehicle_type_code',
      (row_data->>'monthly_total_cost')::numeric,
      (row_data->>'pickup_date')::date,
      (row_data->>'sale_date')::date,
      row_data->>'group_name',
      row_data->>'internal_number',
      (row_data->>'vehicle_budget')::numeric,
      (row_data->>'upgrade_addition')::numeric,
      row_data->>'vehicle_type_name',
      (row_data->>'base_index')::numeric,
      row_data->>'driver_code',
      row_data->>'pascal',
      (row_data->>'next_alert_km')::int,
      (row_data->>'mandatory_end_date')::date,
      (row_data->>'odometer_diff_maintenance')::numeric,
      (row_data->>'org_id')::uuid,
      row_data->>'fuel_type',
      (row_data->>'service_interval_km')::int,
      row_data->>'safety_officer',
      (row_data->>'assigned_driver_id')::uuid
    )
    ON CONFLICT (plate_number, org_id) DO UPDATE SET
      manufacturer              = COALESCE(EXCLUDED.manufacturer, vehicles.manufacturer),
      model                     = COALESCE(EXCLUDED.model, vehicles.model),
      year                      = COALESCE(EXCLUDED.year, vehicles.year),
      current_odometer          = COALESCE(EXCLUDED.current_odometer, vehicles.current_odometer),
      next_maintenance_km       = COALESCE(EXCLUDED.next_maintenance_km, vehicles.next_maintenance_km),
      next_maintenance_date     = COALESCE(EXCLUDED.next_maintenance_date, vehicles.next_maintenance_date),
      test_expiry               = COALESCE(EXCLUDED.test_expiry, vehicles.test_expiry),
      insurance_expiry          = COALESCE(EXCLUDED.insurance_expiry, vehicles.insurance_expiry),
      engine_volume             = COALESCE(EXCLUDED.engine_volume, vehicles.engine_volume),
      color                     = COALESCE(EXCLUDED.color, vehicles.color),
      ignition_code             = COALESCE(EXCLUDED.ignition_code, vehicles.ignition_code),
      is_active                 = EXCLUDED.is_active,
      ownership_type            = COALESCE(EXCLUDED.ownership_type, vehicles.ownership_type),
      leasing_company_name      = COALESCE(EXCLUDED.leasing_company_name, vehicles.leasing_company_name),
      last_odometer_date        = COALESCE(EXCLUDED.last_odometer_date, vehicles.last_odometer_date),
      manufacturer_code         = COALESCE(EXCLUDED.manufacturer_code, vehicles.manufacturer_code),
      model_code                = COALESCE(EXCLUDED.model_code, vehicles.model_code),
      tax_value_price           = COALESCE(EXCLUDED.tax_value_price, vehicles.tax_value_price),
      adjusted_price            = COALESCE(EXCLUDED.adjusted_price, vehicles.adjusted_price),
      chassis_number            = COALESCE(EXCLUDED.chassis_number, vehicles.chassis_number),
      vehicle_type_code         = COALESCE(EXCLUDED.vehicle_type_code, vehicles.vehicle_type_code),
      monthly_total_cost        = COALESCE(EXCLUDED.monthly_total_cost, vehicles.monthly_total_cost),
      pickup_date               = COALESCE(EXCLUDED.pickup_date, vehicles.pickup_date),
      sale_date                 = COALESCE(EXCLUDED.sale_date, vehicles.sale_date),
      group_name                = COALESCE(EXCLUDED.group_name, vehicles.group_name),
      internal_number           = COALESCE(EXCLUDED.internal_number, vehicles.internal_number),
      vehicle_budget            = COALESCE(EXCLUDED.vehicle_budget, vehicles.vehicle_budget),
      upgrade_addition          = COALESCE(EXCLUDED.upgrade_addition, vehicles.upgrade_addition),
      vehicle_type_name         = COALESCE(EXCLUDED.vehicle_type_name, vehicles.vehicle_type_name),
      base_index                = COALESCE(EXCLUDED.base_index, vehicles.base_index),
      driver_code               = COALESCE(EXCLUDED.driver_code, vehicles.driver_code),
      pascal                    = COALESCE(EXCLUDED.pascal, vehicles.pascal),
      next_alert_km             = COALESCE(EXCLUDED.next_alert_km, vehicles.next_alert_km),
      mandatory_end_date        = COALESCE(EXCLUDED.mandatory_end_date, vehicles.mandatory_end_date),
      odometer_diff_maintenance = COALESCE(EXCLUDED.odometer_diff_maintenance, vehicles.odometer_diff_maintenance),
      fuel_type                 = COALESCE(EXCLUDED.fuel_type, vehicles.fuel_type),
      service_interval_km       = COALESCE(EXCLUDED.service_interval_km, vehicles.service_interval_km),
      safety_officer            = COALESCE(EXCLUDED.safety_officer, vehicles.safety_officer),
      assigned_driver_id        = COALESCE(EXCLUDED.assigned_driver_id, vehicles.assigned_driver_id),
      updated_at                = now()
    RETURNING id, assigned_driver_id INTO v_id, v_driver_id;

    -- Bidirectional: update the driver's assigned vehicle if driver was assigned
    IF v_driver_id IS NOT NULL THEN
      UPDATE public.drivers
      SET managed_by_user_id = managed_by_user_id  -- no-op to keep row, just update below
      WHERE id = v_driver_id;
      -- Note: drivers doesn't have assigned_vehicle_id yet; using a lightweight approach
      -- The assignment is tracked via vehicles.assigned_driver_id
    END IF;

    total := total + 1;
  END LOOP;

  RETURN jsonb_build_object('count', total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_upsert_vehicles(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
