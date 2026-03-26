
-- Add enrichment columns to pricing_data
ALTER TABLE public.pricing_data
  ADD COLUMN IF NOT EXISTS registration_year integer,
  ADD COLUMN IF NOT EXISTS vehicle_type_code text,
  ADD COLUMN IF NOT EXISTS manufacturer_name text,
  ADD COLUMN IF NOT EXISTS model_description text,
  ADD COLUMN IF NOT EXISTS fuel_type text,
  ADD COLUMN IF NOT EXISTS commercial_name text,
  ADD COLUMN IF NOT EXISTS is_automatic boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS drive_type text,
  ADD COLUMN IF NOT EXISTS green_score integer,
  ADD COLUMN IF NOT EXISTS pollution_level integer,
  ADD COLUMN IF NOT EXISTS engine_volume_cc integer,
  ADD COLUMN IF NOT EXISTS weight integer,
  ADD COLUMN IF NOT EXISTS list_price numeric,
  ADD COLUMN IF NOT EXISTS effective_date text;

-- Add enrichment columns to vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tax_year integer,
  ADD COLUMN IF NOT EXISTS vehicle_type_code text,
  ADD COLUMN IF NOT EXISTS model_description text,
  ADD COLUMN IF NOT EXISTS fuel_type text,
  ADD COLUMN IF NOT EXISTS commercial_name text,
  ADD COLUMN IF NOT EXISTS is_automatic boolean,
  ADD COLUMN IF NOT EXISTS drive_type text,
  ADD COLUMN IF NOT EXISTS green_score integer,
  ADD COLUMN IF NOT EXISTS pollution_level integer,
  ADD COLUMN IF NOT EXISTS weight integer,
  ADD COLUMN IF NOT EXISTS list_price numeric,
  ADD COLUMN IF NOT EXISTS adjusted_price numeric,
  ADD COLUMN IF NOT EXISTS tax_value_price numeric,
  ADD COLUMN IF NOT EXISTS effective_date text;

-- Sync function: match vehicles to pricing_data by manufacturer_code + model_code + year
CREATE OR REPLACE FUNCTION public.sync_vehicles_from_pricing()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count integer := 0;
  total_vehicles integer := 0;
BEGIN
  SELECT count(*) INTO total_vehicles
  FROM vehicles
  WHERE manufacturer_code IS NOT NULL AND model_code IS NOT NULL;

  UPDATE vehicles v
  SET
    tax_year = p.usage_year,
    vehicle_type_code = p.vehicle_type_code,
    model_description = p.model_description,
    fuel_type = p.fuel_type,
    commercial_name = p.commercial_name,
    is_automatic = p.is_automatic,
    drive_type = p.drive_type,
    green_score = p.green_score,
    pollution_level = p.pollution_level,
    engine_volume = COALESCE(p.engine_volume_cc::text, v.engine_volume),
    weight = p.weight,
    list_price = p.list_price,
    adjusted_price = p.adjusted_price,
    tax_value_price = p.usage_value,
    effective_date = p.effective_date,
    updated_at = now()
  FROM pricing_data p
  WHERE v.manufacturer_code = p.manufacturer_code
    AND v.model_code = p.model_code
    AND v.year = p.registration_year
    AND v.manufacturer_code IS NOT NULL
    AND v.model_code IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN json_build_object('updated', updated_count, 'total', total_vehicles);
END;
$$;
