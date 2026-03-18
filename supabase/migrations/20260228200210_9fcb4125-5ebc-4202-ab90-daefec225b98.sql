
-- Drop the old unique constraint on (manufacturer_code, model_code)
ALTER TABLE public.pricing_data DROP CONSTRAINT IF EXISTS pricing_data_manufacturer_code_model_code_key;

-- Create new unique constraint on (manufacturer_code, model_code, registration_year)
ALTER TABLE public.pricing_data ADD CONSTRAINT pricing_data_manufacturer_code_model_code_year_key 
  UNIQUE (manufacturer_code, model_code, registration_year);
