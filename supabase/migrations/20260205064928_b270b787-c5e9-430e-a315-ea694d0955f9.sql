-- Add new columns to drivers table
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS job_title text,
ADD COLUMN IF NOT EXISTS department text,
ADD COLUMN IF NOT EXISTS license_number text,
ADD COLUMN IF NOT EXISTS regulation_585b_date date;

-- Add new columns to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS engine_volume text,
ADD COLUMN IF NOT EXISTS color text,
ADD COLUMN IF NOT EXISTS ignition_code text,
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pickup_date date,
ADD COLUMN IF NOT EXISTS road_ascent_year integer,
ADD COLUMN IF NOT EXISTS road_ascent_month integer,
ADD COLUMN IF NOT EXISTS ownership_type text,
ADD COLUMN IF NOT EXISTS leasing_company_name text,
ADD COLUMN IF NOT EXISTS last_odometer_date date,
ADD COLUMN IF NOT EXISTS manufacturer_code text,
ADD COLUMN IF NOT EXISTS model_code text;

-- Create driver_documents table for document folder
CREATE TABLE IF NOT EXISTS public.driver_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    title text NOT NULL,
    file_url text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on driver_documents
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for driver_documents
CREATE POLICY "Managers can manage driver documents"
ON public.driver_documents
FOR ALL
USING (is_manager(auth.uid()));

CREATE POLICY "Drivers can view own documents"
ON public.driver_documents
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.drivers 
        WHERE drivers.id = driver_documents.driver_id 
        AND drivers.user_id = auth.uid()
    )
);

-- Create pricing_data table for Excel import
CREATE TABLE IF NOT EXISTS public.pricing_data (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer_code text NOT NULL,
    model_code text NOT NULL,
    usage_value numeric,
    usage_year integer,
    adjusted_price numeric,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(manufacturer_code, model_code)
);

-- Enable RLS on pricing_data
ALTER TABLE public.pricing_data ENABLE ROW LEVEL SECURITY;

-- RLS policies for pricing_data (read-only for all authenticated, write for managers)
CREATE POLICY "Authenticated users can view pricing data"
ON public.pricing_data
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage pricing data"
ON public.pricing_data
FOR ALL
USING (is_manager(auth.uid()));

-- Create trigger for pricing_data updated_at
CREATE TRIGGER update_pricing_data_updated_at
BEFORE UPDATE ON public.pricing_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Create index for pricing lookup
CREATE INDEX IF NOT EXISTS idx_pricing_data_codes ON public.pricing_data(manufacturer_code, model_code);