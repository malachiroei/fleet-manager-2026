
-- Add missing columns to drivers table for Excel import
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS driver_code text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS employee_number text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS work_start_date date;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS note1 text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS note2 text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS rating text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS division text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS eligibility text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS group_code text;

-- Add missing columns to vehicles table for Excel import
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS chassis_number text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS monthly_total_cost numeric;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS sale_date date;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS internal_number text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_budget numeric;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS upgrade_addition numeric;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_type_name text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS base_index numeric;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS driver_code text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS pascal text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS next_alert_km integer;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS mandatory_end_date date;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS odometer_diff_maintenance numeric;
