-- Add operational costs fields to vehicles table
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS tax_value_price DECIMAL(10, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS tax_value_year INTEGER;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS adjusted_price DECIMAL(10, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS model_code VARCHAR(50);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS chassis_number VARCHAR(100);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS average_fuel_consumption DECIMAL(5, 2);

-- Add comments for documentation
COMMENT ON COLUMN public.vehicles.tax_value_price IS 'מחיר שווי לצורכי מס';
COMMENT ON COLUMN public.vehicles.tax_value_year IS 'שנת שווי';
COMMENT ON COLUMN public.vehicles.adjusted_price IS 'מחיר מתואם';
COMMENT ON COLUMN public.vehicles.model_code IS 'סמל דגם';
COMMENT ON COLUMN public.vehicles.chassis_number IS 'מספר שלדה';
COMMENT ON COLUMN public.vehicles.average_fuel_consumption IS 'צריכת דלק ממוצעת (ל״ט/100 ק״מ)';
