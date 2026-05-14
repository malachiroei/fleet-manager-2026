-- 1) UNIQUE constraint on vehicles.plate_number (for upsert conflict detection)
--    Using (plate_number, org_id) for multi-org support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vehicles'::regclass
      AND conname = 'vehicles_plate_number_org_id_key'
  ) THEN
    -- Remove duplicates first (keep most recent)
    DELETE FROM public.vehicles
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               row_number() OVER (
                 PARTITION BY plate_number, org_id
                 ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id ASC
               ) AS rn
        FROM public.vehicles
      ) ranked
      WHERE rn > 1
    );

    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_plate_number_org_id_key UNIQUE (plate_number, org_id);
  END IF;
END $$;

-- 2) Rewrite bulk_upsert_drivers — accepts JSON, updates ALL provided fields
DROP FUNCTION IF EXISTS public.bulk_upsert_drivers(jsonb);

CREATE OR REPLACE FUNCTION public.bulk_upsert_drivers(drivers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  total int := 0;
BEGIN
  FOR row_data IN SELECT * FROM jsonb_array_elements(drivers)
  LOOP
    INSERT INTO public.drivers (
      full_name, id_number, phone, email, license_expiry,
      safety_training_date, department, address, driver_code,
      is_active, employee_number, work_start_date, city,
      note1, note2, rating, division, eligibility, area,
      group_name, group_code, job_title, license_number,
      status, org_id, birth_date, driving_permit, safety_officer
    ) VALUES (
      row_data->>'full_name',
      row_data->>'id_number',
      row_data->>'phone',
      row_data->>'email',
      (row_data->>'license_expiry')::date,
      (row_data->>'safety_training_date')::date,
      row_data->>'department',
      row_data->>'address',
      row_data->>'driver_code',
      COALESCE((row_data->>'is_active')::bool, true),
      row_data->>'employee_number',
      (row_data->>'work_start_date')::date,
      row_data->>'city',
      row_data->>'note1',
      row_data->>'note2',
      row_data->>'rating',
      row_data->>'division',
      row_data->>'eligibility',
      row_data->>'area',
      row_data->>'group_name',
      row_data->>'group_code',
      row_data->>'job_title',
      row_data->>'license_number',
      COALESCE(row_data->>'status', 'valid'),
      (row_data->>'org_id')::uuid,
      (row_data->>'birth_date')::date,
      row_data->>'driving_permit',
      row_data->>'safety_officer'
    )
    ON CONFLICT (id_number, org_id) DO UPDATE SET
      full_name            = COALESCE(EXCLUDED.full_name, drivers.full_name),
      phone                = COALESCE(EXCLUDED.phone, drivers.phone),
      email                = COALESCE(EXCLUDED.email, drivers.email),
      license_expiry       = COALESCE(EXCLUDED.license_expiry, drivers.license_expiry),
      safety_training_date = COALESCE(EXCLUDED.safety_training_date, drivers.safety_training_date),
      department           = COALESCE(EXCLUDED.department, drivers.department),
      address              = COALESCE(EXCLUDED.address, drivers.address),
      driver_code          = COALESCE(EXCLUDED.driver_code, drivers.driver_code),
      is_active            = EXCLUDED.is_active,
      employee_number      = COALESCE(EXCLUDED.employee_number, drivers.employee_number),
      work_start_date      = COALESCE(EXCLUDED.work_start_date, drivers.work_start_date),
      city                 = COALESCE(EXCLUDED.city, drivers.city),
      note1                = COALESCE(EXCLUDED.note1, drivers.note1),
      note2                = COALESCE(EXCLUDED.note2, drivers.note2),
      rating               = COALESCE(EXCLUDED.rating, drivers.rating),
      division             = COALESCE(EXCLUDED.division, drivers.division),
      eligibility          = COALESCE(EXCLUDED.eligibility, drivers.eligibility),
      area                 = COALESCE(EXCLUDED.area, drivers.area),
      group_name           = COALESCE(EXCLUDED.group_name, drivers.group_name),
      group_code           = COALESCE(EXCLUDED.group_code, drivers.group_code),
      job_title            = COALESCE(EXCLUDED.job_title, drivers.job_title),
      license_number       = COALESCE(EXCLUDED.license_number, drivers.license_number),
      status               = COALESCE(EXCLUDED.status, drivers.status),
      birth_date           = COALESCE(EXCLUDED.birth_date, drivers.birth_date),
      driving_permit       = COALESCE(EXCLUDED.driving_permit, drivers.driving_permit),
      safety_officer       = COALESCE(EXCLUDED.safety_officer, drivers.safety_officer),
      updated_at           = now();

    total := total + 1;
  END LOOP;

  RETURN jsonb_build_object('count', total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_upsert_drivers(jsonb) TO authenticated;

-- 3) Create bulk_upsert_vehicles RPC
CREATE OR REPLACE FUNCTION public.bulk_upsert_vehicles(vehicles jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  total int := 0;
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
      service_interval_km, safety_officer
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
      row_data->>'safety_officer'
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
      updated_at                = now();

    total := total + 1;
  END LOOP;

  RETURN jsonb_build_object('count', total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_upsert_vehicles(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
