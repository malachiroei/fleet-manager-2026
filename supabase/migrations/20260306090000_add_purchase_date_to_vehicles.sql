-- Add purchase_date column to vehicles table
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS purchase_date date;

COMMENT ON COLUMN public.vehicles.purchase_date IS 'תאריך קניה / תחילת עסקה';
