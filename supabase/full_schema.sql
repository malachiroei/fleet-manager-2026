-- full_schema.sql
-- Merged from supabase/migrations in filename order (oldest timestamp first).
-- Review before applying to an existing database; this is a linear concatenation of all migrations.


-- =============================================================================
-- FILE: 20260203195001_44c3a5b9-ccc1-4db3-9703-404e8ba36be2.sql
-- =============================================================================

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'fleet_manager', 'viewer', 'driver');

-- Create enum for compliance status
CREATE TYPE public.compliance_status AS ENUM ('valid', 'warning', 'expired');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicles table
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number TEXT NOT NULL UNIQUE,
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    current_odometer INTEGER NOT NULL DEFAULT 0,
    next_maintenance_km INTEGER,
    next_maintenance_date DATE,
    test_expiry DATE NOT NULL,
    insurance_expiry DATE NOT NULL,
    license_image_url TEXT,
    insurance_pdf_url TEXT,
    status compliance_status NOT NULL DEFAULT 'valid',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create drivers table
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    id_number TEXT NOT NULL UNIQUE,
    phone TEXT,
    email TEXT,
    license_expiry DATE NOT NULL,
    health_declaration_date DATE,
    safety_training_date DATE,
    license_front_url TEXT,
    license_back_url TEXT,
    health_declaration_url TEXT,
    status compliance_status NOT NULL DEFAULT 'valid',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create maintenance_logs table
CREATE TABLE public.maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
    service_date DATE NOT NULL,
    service_type TEXT NOT NULL,
    odometer_reading INTEGER NOT NULL,
    garage_name TEXT,
    cost DECIMAL(10, 2),
    notes TEXT,
    invoice_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicle_handovers table (for substitution/rental)
CREATE TABLE public.vehicle_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    handover_type TEXT NOT NULL CHECK (handover_type IN ('delivery', 'return')),
    handover_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    odometer_reading INTEGER NOT NULL,
    fuel_level INTEGER NOT NULL CHECK (fuel_level >= 1 AND fuel_level <= 8),
    photo_front_url TEXT,
    photo_back_url TEXT,
    photo_right_url TEXT,
    photo_left_url TEXT,
    signature_url TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create compliance_alerts table for tracking alerts
CREATE TABLE public.compliance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('vehicle', 'driver')),
    entity_id UUID NOT NULL,
    alert_type TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    status compliance_status NOT NULL DEFAULT 'warning',
    email_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role = _role
    )
$$;

-- Create function to check if user has any management role
CREATE OR REPLACE FUNCTION public.is_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role IN ('admin', 'fleet_manager')
    )
$$;

-- Create function to check if user is driver for specific driver record
CREATE OR REPLACE FUNCTION public.is_own_driver_record(_user_id UUID, _driver_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.drivers
        WHERE id = _driver_id
        AND user_id = _user_id
    )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
    ON public.user_roles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
    ON public.user_roles FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_manager(auth.uid()));

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policies for vehicles (managers can CRUD, viewers and drivers can read)
CREATE POLICY "Authenticated users can view vehicles"
    ON public.vehicles FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage vehicles"
    ON public.vehicles FOR ALL
    USING (public.is_manager(auth.uid()));

-- RLS Policies for drivers
CREATE POLICY "Managers can view all drivers"
    ON public.drivers FOR SELECT
    USING (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), 'viewer'));

CREATE POLICY "Drivers can view own record"
    ON public.drivers FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Managers can manage drivers"
    ON public.drivers FOR ALL
    USING (public.is_manager(auth.uid()));

CREATE POLICY "Drivers can update own non-sensitive fields"
    ON public.drivers FOR UPDATE
    USING (user_id = auth.uid());

-- RLS Policies for maintenance_logs
CREATE POLICY "Authenticated users can view maintenance logs"
    ON public.maintenance_logs FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage maintenance logs"
    ON public.maintenance_logs FOR ALL
    USING (public.is_manager(auth.uid()));

-- RLS Policies for vehicle_handovers
CREATE POLICY "Authenticated users can view handovers"
    ON public.vehicle_handovers FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage handovers"
    ON public.vehicle_handovers FOR ALL
    USING (public.is_manager(auth.uid()));

CREATE POLICY "Drivers can create handovers"
    ON public.vehicle_handovers FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'driver'));

-- RLS Policies for compliance_alerts
CREATE POLICY "Managers can view alerts"
    ON public.compliance_alerts FOR SELECT
    USING (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), 'viewer'));

CREATE POLICY "Managers can manage alerts"
    ON public.compliance_alerts FOR ALL
    USING (public.is_manager(auth.uid()));

-- Create function to update vehicle odometer from maintenance log
CREATE OR REPLACE FUNCTION public.update_vehicle_odometer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.vehicles
    SET current_odometer = NEW.odometer_reading,
        updated_at = now()
    WHERE id = NEW.vehicle_id
    AND current_odometer < NEW.odometer_reading;
    RETURN NEW;
END;
$$;

-- Create trigger for odometer sync
CREATE TRIGGER sync_vehicle_odometer
    AFTER INSERT ON public.maintenance_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_vehicle_odometer();

-- Create function to update compliance status
CREATE OR REPLACE FUNCTION public.calculate_compliance_status(expiry_date DATE)
RETURNS compliance_status
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF expiry_date < CURRENT_DATE THEN
        RETURN 'expired';
    ELSIF expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN
        RETURN 'warning';
    ELSE
        RETURN 'valid';
    END IF;
END;
$$;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_drivers_updated_at
    BEFORE UPDATE ON public.drivers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- Create function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'), NEW.email);
    
    -- Default role is viewer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');
    
    RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- FILE: 20260203195043_b0fdaf3a-2bf8-49ac-80b3-0f8e904b013e.sql
-- =============================================================================

-- Fix function search_path warnings
CREATE OR REPLACE FUNCTION public.calculate_compliance_status(expiry_date DATE)
RETURNS compliance_status
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    IF expiry_date < CURRENT_DATE THEN
        RETURN 'expired';
    ELSIF expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN
        RETURN 'warning';
    ELSE
        RETURN 'valid';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Create private storage buckets for documents
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('vehicle-documents', 'vehicle-documents', false),
    ('driver-documents', 'driver-documents', false),
    ('maintenance-documents', 'maintenance-documents', false),
    ('handover-photos', 'handover-photos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for vehicle-documents bucket
CREATE POLICY "Managers can view vehicle documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can upload vehicle documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can update vehicle documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete vehicle documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

-- RLS Policies for driver-documents bucket (more restricted)
CREATE POLICY "Managers can view driver documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can upload driver documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can update driver documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete driver documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

-- RLS Policies for maintenance-documents bucket
CREATE POLICY "Authenticated users can view maintenance docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'maintenance-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers can upload maintenance docs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'maintenance-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can update maintenance docs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'maintenance-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete maintenance docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'maintenance-documents' AND public.is_manager(auth.uid()));

-- RLS Policies for handover-photos bucket
CREATE POLICY "Authenticated users can view handover photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'handover-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers and drivers can upload handover photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'handover-photos' AND (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), 'driver')));

CREATE POLICY "Managers can update handover photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'handover-photos' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete handover photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'handover-photos' AND public.is_manager(auth.uid()));

-- =============================================================================
-- FILE: 20260205064928_b270b787-c5e9-430e-a315-ea694d0955f9.sql
-- =============================================================================

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

-- =============================================================================
-- FILE: 20260206132532_802f6098-e1da-49ee-b61f-61ef1135fbac.sql
-- =============================================================================

-- Add INSERT policy for authenticated users on drivers table
CREATE POLICY "Authenticated users can create drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Add INSERT policy for authenticated users on vehicles table
CREATE POLICY "Authenticated users can create vehicles"
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================================================
-- FILE: 20260207091804_a883fa9b-819a-4378-8f84-b2c02aad7071.sql
-- =============================================================================

-- Drop existing restrictive INSERT policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Authenticated users can create vehicles" ON public.vehicles;

-- Create PERMISSIVE INSERT policies for drivers
CREATE POLICY "Authenticated users can insert drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create PERMISSIVE INSERT policies for vehicles
CREATE POLICY "Authenticated users can insert vehicles"
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add PERMISSIVE UPDATE policy for managers to update any driver
DROP POLICY IF EXISTS "Managers can manage drivers" ON public.drivers;
CREATE POLICY "Managers can manage all drivers"
ON public.drivers
FOR ALL
TO authenticated
USING (is_manager(auth.uid()));

-- Add PERMISSIVE UPDATE policy for managers to update any vehicle (including assigning drivers)
DROP POLICY IF EXISTS "Managers can manage vehicles" ON public.vehicles;
CREATE POLICY "Managers can manage all vehicles"
ON public.vehicles
FOR ALL
TO authenticated
USING (is_manager(auth.uid()));

-- Ensure authenticated users can update vehicles they're assigned to (for odometer updates etc.)
CREATE POLICY "Assigned drivers can update vehicle odometer"
ON public.vehicles
FOR UPDATE
TO authenticated
USING (
  assigned_driver_id IN (
    SELECT id FROM public.drivers WHERE user_id = auth.uid()
  )
);

-- =============================================================================
-- FILE: 20260209103846_42193551-857f-49b1-82de-4f5046283e72.sql
-- =============================================================================

-- Drop ALL existing policies on drivers table to start fresh
DROP POLICY IF EXISTS "Authenticated users can insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own non-sensitive fields" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view own record" ON public.drivers;
DROP POLICY IF EXISTS "Managers can manage all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers can manage drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers can view all drivers" ON public.drivers;

-- Create new PERMISSIVE policies for drivers

-- Allow any authenticated user to INSERT new drivers
CREATE POLICY "Authenticated users can create drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Managers can do anything (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Managers can manage all drivers"
ON public.drivers
FOR ALL
TO authenticated
USING (is_manager(auth.uid()));

-- Viewers and managers can view all drivers
CREATE POLICY "Users can view all drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (is_manager(auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));

-- Drivers can view their own record
CREATE POLICY "Drivers can view own record"
ON public.drivers
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Drivers can update their own record (non-sensitive fields)
CREATE POLICY "Drivers can update own record"
ON public.drivers
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- =============================================================================
-- FILE: 20260209111651_56c04586-e93f-4503-880b-9a3b6eb22ab1.sql
-- =============================================================================


-- Make handover-photos bucket public
UPDATE storage.buckets SET public = true WHERE id = 'handover-photos';

-- Drop conflicting policy and recreate
DROP POLICY IF EXISTS "Authenticated users can view handover photos" ON storage.objects;

-- Ensure upload policy exists (may have been created)
DROP POLICY IF EXISTS "Authenticated users can upload handover photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload handover photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'handover-photos');

CREATE POLICY "Anyone can view handover photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'handover-photos');

-- Driver-vehicle assignment log table
CREATE TABLE IF NOT EXISTS public.driver_vehicle_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMP WITH TIME ZONE,
  assigned_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view assignments"
ON public.driver_vehicle_assignments FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage assignments"
ON public.driver_vehicle_assignments FOR ALL
TO authenticated
USING (is_manager(auth.uid()));

-- =============================================================================
-- FILE: 20260209112559_20cf77bf-1564-434b-b856-7b84846f312b.sql
-- =============================================================================


-- Drop restrictive insert policy
DROP POLICY IF EXISTS "Drivers can create handovers" ON public.vehicle_handovers;

-- Allow any authenticated user to create handovers
CREATE POLICY "Authenticated users can create handovers"
ON public.vehicle_handovers
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================================================
-- FILE: 20260209113450_4285172d-86d9-4e0a-83f3-b52eaab30543.sql
-- =============================================================================


-- Create trigger to auto-update vehicle assigned_driver_id on handover delivery
CREATE OR REPLACE FUNCTION public.handle_handover_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.handover_type = 'delivery' THEN
        -- Assign driver to vehicle
        UPDATE public.vehicles
        SET assigned_driver_id = NEW.driver_id, updated_at = now()
        WHERE id = NEW.vehicle_id;
        
        -- Close previous assignment for this vehicle (if any)
        UPDATE public.driver_vehicle_assignments
        SET unassigned_at = now()
        WHERE vehicle_id = NEW.vehicle_id AND unassigned_at IS NULL;
        
        -- Create new assignment record
        INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes)
        VALUES (NEW.vehicle_id, NEW.driver_id, NEW.created_by, 'שיוך אוטומטי ממסירת רכב');
        
    ELSIF NEW.handover_type = 'return' THEN
        -- Unassign driver from vehicle
        UPDATE public.vehicles
        SET assigned_driver_id = NULL, updated_at = now()
        WHERE id = NEW.vehicle_id;
        
        -- Close assignment record
        UPDATE public.driver_vehicle_assignments
        SET unassigned_at = now()
        WHERE vehicle_id = NEW.vehicle_id AND driver_id = NEW.driver_id AND unassigned_at IS NULL;
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_handover_created
AFTER INSERT ON public.vehicle_handovers
FOR EACH ROW
EXECUTE FUNCTION public.handle_handover_assignment();

-- =============================================================================
-- FILE: 20260216100000_add_operational_costs_fields.sql
-- =============================================================================

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

-- =============================================================================
-- FILE: 20260217123000_allow_authenticated_select_drivers.sql
-- =============================================================================

-- Ensure all authenticated users can view drivers list
-- This prevents empty lists when drivers.user_id is NULL or viewer/manager role is missing.

DROP POLICY IF EXISTS "Users can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Authenticated users can view all drivers" ON public.drivers;

CREATE POLICY "Authenticated users can view all drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- FILE: 20260228190348_a7714547-bcb3-4bd0-9b70-c469e38b9e28.sql
-- =============================================================================


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

-- =============================================================================
-- FILE: 20260228191047_67284dc2-0750-41f8-8ac1-ecfec1f084e9.sql
-- =============================================================================


-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can view pricing data" ON public.pricing_data;
DROP POLICY IF EXISTS "Managers can manage pricing data" ON public.pricing_data;

CREATE POLICY "Authenticated users can view pricing data"
  ON public.pricing_data FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage pricing data"
  ON public.pricing_data FOR ALL
  TO authenticated
  USING (is_manager(auth.uid()))
  WITH CHECK (is_manager(auth.uid()));

-- =============================================================================
-- FILE: 20260228192926_021bb1bf-83c6-4aff-814c-9a07a7cd7cd9.sql
-- =============================================================================


-- Fix drivers table RLS: change RESTRICTIVE to PERMISSIVE

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers can manage all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Users can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view own record" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own record" ON public.drivers;

-- Recreate as PERMISSIVE
CREATE POLICY "Authenticated users can create drivers"
  ON public.drivers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Managers can manage all drivers"
  ON public.drivers FOR ALL
  TO authenticated
  USING (is_manager(auth.uid()))
  WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "Users can view all drivers"
  ON public.drivers FOR SELECT
  TO authenticated
  USING (is_manager(auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "Drivers can view own record"
  ON public.drivers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Drivers can update own record"
  ON public.drivers FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- FILE: 20260228194240_fba2ab5c-d6bc-4cf0-b39a-9cf909aa810d.sql
-- =============================================================================

-- Allow authenticated users to upload pricing data (delete + insert workflow)
-- Keep existing manager policy; add explicit permissive policies for authenticated import actions.

DROP POLICY IF EXISTS "Authenticated users can insert pricing data" ON public.pricing_data;
DROP POLICY IF EXISTS "Authenticated users can delete pricing data" ON public.pricing_data;

CREATE POLICY "Authenticated users can insert pricing data"
  ON public.pricing_data
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete pricing data"
  ON public.pricing_data
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =============================================================================
-- FILE: 20260228200210_9fcb4125-5ebc-4202-ab90-daefec225b98.sql
-- =============================================================================


-- Drop the old unique constraint on (manufacturer_code, model_code)
ALTER TABLE public.pricing_data DROP CONSTRAINT IF EXISTS pricing_data_manufacturer_code_model_code_key;

-- Create new unique constraint on (manufacturer_code, model_code, registration_year)
ALTER TABLE public.pricing_data ADD CONSTRAINT pricing_data_manufacturer_code_model_code_year_key 
  UNIQUE (manufacturer_code, model_code, registration_year);

-- =============================================================================
-- FILE: 20260228200435_42c80dfa-fed2-4bce-af2e-087eac69acce.sql
-- =============================================================================


ALTER TABLE public.pricing_data DROP CONSTRAINT IF EXISTS pricing_data_manufacturer_code_model_code_year_key;

-- =============================================================================
-- FILE: 20260228215154_9d17947f-09ec-424b-bee5-148fcd742158.sql
-- =============================================================================


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

-- =============================================================================
-- FILE: 20260228223423_b0f4d70b-6849-4664-8f87-7596e0ce4bf7.sql
-- =============================================================================


CREATE TABLE public.procedure6_complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_number TEXT NOT NULL,
  report_id TEXT,
  report_type TEXT,
  location TEXT,
  description TEXT,
  report_date_time TIMESTAMPTZ,
  reporter_name TEXT,
  reporter_cell_phone TEXT,
  received_time TIMESTAMPTZ,
  receiver_name TEXT,
  driver_response TEXT,
  driver_name TEXT,
  action_taken TEXT,
  first_update_time TIMESTAMPTZ,
  last_update_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.procedure6_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage complaints"
  ON public.procedure6_complaints
  FOR ALL
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "Viewers can read complaints"
  ON public.procedure6_complaints
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_procedure6_complaints_updated_at
  BEFORE UPDATE ON public.procedure6_complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- FILE: 20260302093000_add_handover_mode_and_vehicle_documents.sql
-- =============================================================================

-- Add assignment mode for delivery handovers
ALTER TABLE public.vehicle_handovers
ADD COLUMN IF NOT EXISTS assignment_mode text NOT NULL DEFAULT 'permanent'
CHECK (assignment_mode IN ('permanent', 'replacement'));

-- Create vehicle documents table for archived handover forms
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    handover_id uuid REFERENCES public.vehicle_handovers(id) ON DELETE SET NULL,
    title text NOT NULL,
    file_url text NOT NULL,
    document_type text NOT NULL DEFAULT 'handover',
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage vehicle documents"
ON public.vehicle_documents
FOR ALL
USING (is_manager(auth.uid()));

CREATE POLICY "Authenticated users can view vehicle documents"
ON public.vehicle_documents
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Update assignment trigger logic:
-- delivery with replacement mode should NOT update assigned_driver_id
CREATE OR REPLACE FUNCTION public.handle_handover_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.handover_type = 'delivery' THEN
        IF COALESCE(NEW.assignment_mode, 'permanent') = 'permanent' THEN
            UPDATE public.vehicles
            SET assigned_driver_id = NEW.driver_id, updated_at = now()
            WHERE id = NEW.vehicle_id;

            UPDATE public.driver_vehicle_assignments
            SET unassigned_at = now()
            WHERE vehicle_id = NEW.vehicle_id AND unassigned_at IS NULL;

            INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes)
            VALUES (NEW.vehicle_id, NEW.driver_id, NEW.created_by, 'שיוך אוטומטי ממסירת רכב קבועה');
        ELSE
            INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes, unassigned_at)
            VALUES (NEW.vehicle_id, NEW.driver_id, NEW.created_by, 'מסירת רכב חליפי (ללא שיוך קבוע)', now());
        END IF;

    ELSIF NEW.handover_type = 'return' THEN
        UPDATE public.vehicles
        SET assigned_driver_id = NULL, updated_at = now()
        WHERE id = NEW.vehicle_id;

        UPDATE public.driver_vehicle_assignments
        SET unassigned_at = now()
        WHERE vehicle_id = NEW.vehicle_id AND driver_id = NEW.driver_id AND unassigned_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- FILE: 20260302143000_fix_handover_storage_and_pdf_url.sql
-- =============================================================================

ALTER TABLE public.vehicle_handovers
ADD COLUMN IF NOT EXISTS pdf_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-documents', 'vehicle-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Managers can view vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete vehicle documents" ON storage.objects;

CREATE POLICY "Authenticated users can view vehicle documents storage"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload vehicle documents storage"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update vehicle documents storage"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete vehicle documents storage"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

-- =============================================================================
-- FILE: 20260304100000_add_handover_email_webhook.sql
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add Database Webhook → send-handover-email Edge Function
-- Fires after every INSERT into driver_documents.
-- The edge function itself filters to only process handover_receipt anchor docs.
-- ──────────────────────────────────────────────────────────────────────────────

-- supabase_functions.http_request is built-in to every Supabase project.
-- It sends an async HTTP request and automatically includes the service-role JWT.

create or replace function public.notify_send_handover_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform
    supabase_functions.http_request(
      'https://nlsdthcbvqgsfnlnbzcy.supabase.co/functions/v1/send-handover-email',
      'POST',
      '{"Content-Type": "application/json"}'::jsonb,
      jsonb_build_object(
        'type',       TG_OP,
        'table',      TG_TABLE_NAME,
        'schema',     TG_TABLE_SCHEMA,
        'record',     row_to_json(NEW),
        'old_record', null
      ),
      '10000'   -- timeout ms
    );
  return NEW;
end;
$$;

-- Drop existing trigger if it exists (idempotent)
drop trigger if exists on_driver_document_inserted on public.driver_documents;

-- Create the trigger
create trigger on_driver_document_inserted
  after insert on public.driver_documents
  for each row
  execute function public.notify_send_handover_email();

-- =============================================================================
-- FILE: 20260304110000_create_system_settings.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- system_settings  — generic key/value store for app-wide configuration.
-- key:   text  PRIMARY KEY  (e.g. 'notification_emails')
-- value: jsonb              (e.g. '["admin@example.com","fleet@example.com"]')
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.system_settings (
  key        text        primary key,
  value      jsonb       not null default '{}',
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.set_system_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_system_settings_updated_at on public.system_settings;
create trigger trg_system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.set_system_settings_updated_at();

-- RLS: authenticated users may read and write (admin-only enforcement is done at
-- the app layer; add a role check here if stricter access control is needed).
alter table public.system_settings enable row level security;

drop policy if exists "authenticated can select system_settings" on public.system_settings;
create policy "authenticated can select system_settings"
  on public.system_settings for select
  to authenticated using (true);

drop policy if exists "authenticated can upsert system_settings" on public.system_settings;
create policy "authenticated can upsert system_settings"
  on public.system_settings for all
  to authenticated using (true) with check (true);

-- ── Seed defaults ─────────────────────────────────────────────────────────────
insert into public.system_settings (key, value) values
  ('notification_emails', '["malachiroei@gmail.com"]')
on conflict (key) do nothing;

-- =============================================================================
-- FILE: 20260305120000_fix_vehicle_documents_upload_policy.sql
-- =============================================================================

-- Migration: Fix vehicle-documents upload policy to allow all authenticated users.
-- Previously only is_manager() could upload, causing 403 during the wizard for regular users.

DROP POLICY IF EXISTS "Managers can upload vehicle documents"                    ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vehicle documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view vehicle documents storage"   ON storage.objects;
DROP POLICY IF EXISTS "Managers can view vehicle documents"                      ON storage.objects;
DROP POLICY IF EXISTS "vehicle_documents_select_authenticated"                   ON storage.objects;
DROP POLICY IF EXISTS "vehicle_documents_insert_authenticated"                   ON storage.objects;

CREATE POLICY "vehicle_documents_select_authenticated"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "vehicle_documents_insert_authenticated"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

UPDATE storage.buckets
SET public = true
WHERE id = 'vehicle-documents';

-- =============================================================================
-- FILE: 20260306090000_add_purchase_date_to_vehicles.sql
-- =============================================================================

-- Add purchase_date column to vehicles table
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS purchase_date date;

COMMENT ON COLUMN public.vehicles.purchase_date IS 'תאריך קניה / תחילת עסקה';

-- =============================================================================
-- FILE: 20260306100000_create_organization_settings.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- organization_settings  (singleton table — always exactly one row)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name              text NOT NULL DEFAULT '',
  org_id_number         text NOT NULL DEFAULT '',
  admin_email           text NOT NULL DEFAULT '',
  health_statement_text text NOT NULL DEFAULT '',
  vehicle_policy_text   text NOT NULL DEFAULT '',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Only the service role / authenticated users can read/write
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read org settings"
  ON public.organization_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated upsert org settings"
  ON public.organization_settings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed default row with the existing hardcoded texts
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.organization_settings (
  org_name,
  org_id_number,
  admin_email,
  health_statement_text,
  vehicle_policy_text
) VALUES (
  '',
  '',
  '',
  -- health_statement_text: one declaration per line
  E'אינני סובל/ת ממחלת עצבים, אפילפסיה או מחלה העלולה לגרום לאובדן הכרה בזמן נהיגה.\nכושר הראייה שלי תקין (עם תיקון אופטי אם נדרש) ואני מחזיק/ה משקפי ראייה/עדשות בעת הצורך.\nכושר השמיעה שלי תקין ואינני סובל/ת מלקות שמיעה משמעותית.\nאינני נוטל/ת תרופות הגורמות לנמנום, ירידת ריכוז או פגיעה בכושר הנהיגה.\nמצב בריאותי הכללי מאפשר נהיגה בטוחה, ואני כשיר/ה פיזית לנהוג ברכב זה.\nאני מצהיר/ה כי כל הפרטים לעיל נכונים ומדויקים, ואני מודע/ת לאחריותי בנהיגה.',
  -- vehicle_policy_text: one clause per line
  E'הרכב ישמש לצרכי עבודה בלבד, לנסיעות מוסמכות על-פי תפקיד המחזיק.\nחל איסור מוחלט על נהיגה תחת השפעת אלכוהול, סמים או תרופות המשפיעות על הנהיגה.\nחל איסור על נהיגה במצב עייפות. הנהג חייב להפסיק לנסוע ולנוח.\nהנהג חייב לציית לכל חוקי התנועה ולשמור על בטיחות הנסיעה בכל עת.\nהנהג אחראי לבצע בדיקות שגרתיות: מפלס שמן, מים, לחץ צמיגים לפני נסיעה.\nכל תאונה — יש לדווח לממונה ולמחלקת הרכב באופן מיידי, ללא דיחוי.\nכל נזק לרכב, יהיה קטן ככל שיהיה, יש לדווח ולתעד בטרם לקיחת הרכב.\nחל איסור מוחלט על עישון, אכילה ושתייה ברכב המגורים/נוסעים.\nהנהג מחויב להחזיר את הרכב נקי ומסודר, ולדאוג לניקיון שוטף.\nחניה תבוצע במקומות מורשים בלבד. דוחות חניה בגין חניה אסורה — על חשבון הנהג.\nעמלות כבישי אגרה (כביש 6, מנהרות וכד׳) — יחויבו על חשבון הנהג, אלא אם הוסמך אחרת.\nחל איסור להשתמש ברכב למטרות אישיות מחוץ לשעות ולמסגרת האישור שניתן.\nהנהג אינו רשאי להשכיר, להלוות או להעביר את הרכב לצד שלישי כלשהו.\nחל איסור מוחלט לבצע שינויים, תוספות או שדרוגים ברכב ללא אישור מחלקת הרכב.\nנסיעה מחוץ לגבולות ישראל מחייבת אישור מפורש מראש ממנהל המחלקה.\nאין להשאיר חפצי ערך או ציוד ארגוני ברכב בעת חנייה. הסיכון — על הנהג.\nהנהג מחויב לעדכן קריאת מד-אמת בכל תחילת חודש ועם סיום נסיעה עסקית.\nהנהג אחראי לוודא שהביטוח והרישיונות בתוקף. נסיעה עם רישיון פג תוקף — אחריות הנהג.\nרכב חברה אינו מבוטח לשימוש פרטי מלא; נהיגה חריגה עלולה לגרור חיוב אישי בנזק.\nהחזרת הרכב תיעשה באותו מצב כפי שהוחזר, כולל מפתחות, ניירות ואביזרים.\nהפרת נוהל זה תגרור נקיטת הליכים משמעתיים וגישת אחריות אישית לנזקים.'
) ON CONFLICT DO NOTHING;

-- =============================================================================
-- FILE: 20260306110000_org_settings_add_pdf_templates.sql
-- =============================================================================

-- Add PDF template URL columns to organization_settings
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS health_statement_pdf_url  text,
  ADD COLUMN IF NOT EXISTS vehicle_policy_pdf_url   text;

COMMENT ON COLUMN public.organization_settings.health_statement_pdf_url IS 'URL לקובץ PDF תבנית להצהרת בריאות';
COMMENT ON COLUMN public.organization_settings.vehicle_policy_pdf_url   IS 'URL לקובץ PDF תבנית לנוהל שימוש ברכב';

-- =============================================================================
-- FILE: 20260306120000_create_ui_customization.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ui_customization — white-label overrides for button / menu labels
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ui_customization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text UNIQUE NOT NULL,
  default_label text NOT NULL,
  custom_label  text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ui_customization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read ui_customization"
  ON public.ui_customization FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write ui_customization"
  ON public.ui_customization FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default navigation labels (Hebrew)
INSERT INTO public.ui_customization (key, default_label) VALUES
  ('nav.home',              'בית'),
  ('nav.vehicles',          'רכבים'),
  ('nav.fleet_management',  'ניהול צי רכבים'),
  ('nav.vehicle_delivery',  'מסירת רכב'),
  ('nav.compliance',        'התראות חריגה'),
  ('nav.drivers',           'נהגים'),
  ('nav.mileage_update',    'עדכון קילומטראז'),
  ('nav.reports',           'הפקת דוחות'),
  ('nav.accidents',         'תאונות'),
  ('nav.parking',           'דוחות חניה'),
  ('nav.complaints',        'תלונות נוהל 6'),
  ('nav.accounting',        'הנהלת חשבונות'),
  ('nav.fuel',              'דלק'),
  ('nav.settings',          'הגדרות'),
  ('nav.org_settings',      'הגדרות ארגון'),
  ('entity.driver',         'נהג'),
  ('entity.drivers',        'נהגים'),
  ('entity.vehicle',        'רכב'),
  ('entity.vehicles',       'רכבים'),
  ('action.add_driver',     'הוסף נהג'),
  ('action.add_vehicle',    'הוסף רכב'),
  ('action.handover',       'מסירת רכב'),
  ('action.return',         'החזרת רכב')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- FILE: 20260306130000_create_org_documents.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- org_documents — dynamic extra forms managed by the fleet admin
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text NOT NULL DEFAULT '',
  file_url            text,
  include_in_handover boolean NOT NULL DEFAULT false,
  is_standalone       boolean NOT NULL DEFAULT false,
  requires_signature  boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read org_documents"
  ON public.org_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write org_documents"
  ON public.org_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.org_documents IS 'מסמכים נוספים מוגדרים על ידי מנהל הצי';
COMMENT ON COLUMN public.org_documents.include_in_handover IS 'האם לכלול בתהליך האשף';
COMMENT ON COLUMN public.org_documents.is_standalone IS 'האם מסמך עצמאי עם קישור ייעודי לנהג';
COMMENT ON COLUMN public.org_documents.requires_signature IS 'האם הנהג חייב לחתום על מסמך זה';

-- =============================================================================
-- FILE: 20260306140000_ui_customization_add_visibility.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Add is_visible and group_name to ui_customization
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ui_customization
  ADD COLUMN IF NOT EXISTS is_visible  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS group_name  text    NOT NULL DEFAULT '';

-- Assign groups to existing rows
UPDATE public.ui_customization SET group_name = 'ניווט ראשי'    WHERE key = 'nav.home';
UPDATE public.ui_customization SET group_name = 'רכבים'          WHERE key IN ('nav.vehicles','nav.fleet_management', 'nav.vehicle_delivery', 'nav.compliance');
UPDATE public.ui_customization SET group_name = 'תפעולי'         WHERE key IN ('nav.drivers', 'nav.mileage_update', 'nav.reports');
UPDATE public.ui_customization SET group_name = 'אירועים'        WHERE key IN ('nav.accidents', 'nav.parking', 'nav.complaints');
UPDATE public.ui_customization SET group_name = 'כספים'          WHERE key IN ('nav.accounting', 'nav.fuel');
UPDATE public.ui_customization SET group_name = 'הגדרות'         WHERE key IN ('nav.settings', 'nav.org_settings');
UPDATE public.ui_customization SET group_name = 'שמות ישויות'   WHERE key LIKE 'entity.%';
UPDATE public.ui_customization SET group_name = 'כפתורי פעולה'  WHERE key LIKE 'action.%';

-- Ensure nav.home exists (may have been missing from original seed)
INSERT INTO public.ui_customization (key, default_label, group_name) VALUES
  ('nav.home', 'בית', 'ניווט ראשי')
ON CONFLICT (key) DO UPDATE SET group_name = EXCLUDED.group_name;

-- Ensure all other rows have a fallback group
UPDATE public.ui_customization SET group_name = 'כללי' WHERE group_name = '';

-- =============================================================================
-- FILE: 20260306160000_vehicle_folders.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Vehicle Folders: expenses, incidents (events + accidents), maintenance fields
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. vehicle_expenses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  expense_date  date NOT NULL,
  category      text NOT NULL DEFAULT 'other',
  description   text NOT NULL DEFAULT '',
  amount        numeric(10,2) NOT NULL DEFAULT 0,
  supplier      text,
  invoice_url   text,
  notes         text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read vehicle_expenses"  ON public.vehicle_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write vehicle_expenses" ON public.vehicle_expenses FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX ON public.vehicle_expenses(vehicle_id, expense_date DESC);

-- ── 2. vehicle_incidents (events + accidents) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_incidents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  incident_type    text NOT NULL DEFAULT 'event',  -- 'event' | 'accident'
  incident_date    date NOT NULL,
  description      text NOT NULL DEFAULT '',
  location         text,
  driver_id        uuid REFERENCES public.drivers(id),
  damage_desc      text,
  photo_urls       text[],
  police_report_no text,
  insurance_claim  text,
  status           text NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read vehicle_incidents"  ON public.vehicle_incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write vehicle_incidents" ON public.vehicle_incidents FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX ON public.vehicle_incidents(vehicle_id, incident_date DESC);
CREATE INDEX ON public.vehicle_incidents(vehicle_id, incident_type);

-- ── 3. Maintenance extra fields on vehicles ─────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS last_service_date      date,
  ADD COLUMN IF NOT EXISTS last_service_km        integer,
  ADD COLUMN IF NOT EXISTS last_tire_change_date  date,
  ADD COLUMN IF NOT EXISTS next_tire_change_date  date,
  ADD COLUMN IF NOT EXISTS last_inspection_date   date,
  ADD COLUMN IF NOT EXISTS next_inspection_date   date;

-- =============================================================================
-- FILE: 20260306200000_driver_folders.sql
-- =============================================================================

-- ─── Driver extra fields ────────────────────────────────────────────────────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS family_permit_date date,
  ADD COLUMN IF NOT EXISTS driving_permit text,
  ADD COLUMN IF NOT EXISTS is_field_person boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS practical_driving_test_date date;

-- ─── Driver Family Members ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_family_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  relationship    text NOT NULL,          -- spouse / child / parent / sibling / other
  phone           text,
  id_number       text,
  birth_date      date,
  address         text,
  city            text,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE driver_family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage family members"
  ON driver_family_members FOR ALL
  USING (auth.role() = 'authenticated');

-- ─── Driver Incidents (events & accidents) ──────────────────────────────────
-- Accidents are driver-linked; optional vehicle_id enables cross-display on vehicle card
CREATE TABLE IF NOT EXISTS driver_incidents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id          uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  incident_type       text NOT NULL CHECK (incident_type IN ('event', 'accident')),
  incident_date       date NOT NULL,
  description         text NOT NULL,
  location            text,
  damage_desc         text,
  police_report_no    text,
  insurance_claim     text,
  photo_urls          text[],
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE driver_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage driver incidents"
  ON driver_incidents FOR ALL
  USING (auth.role() = 'authenticated');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS driver_incidents_driver_id_idx ON driver_incidents (driver_id);
CREATE INDEX IF NOT EXISTS driver_incidents_vehicle_id_idx ON driver_incidents (vehicle_id);
CREATE INDEX IF NOT EXISTS driver_family_members_driver_id_idx ON driver_family_members (driver_id);

-- =============================================================================
-- FILE: 20260308173000_forms_center_seed_and_schema.sql
-- =============================================================================

-- Forms Center: metadata columns + seeded templates + JSON schemas

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'תפעול',
  ADD COLUMN IF NOT EXISTS json_schema jsonb,
  ADD COLUMN IF NOT EXISTS autofill_fields text[] NOT NULL DEFAULT ARRAY[]::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'org_documents_category_check'
      AND conrelid = 'public.org_documents'::regclass
  ) THEN
    ALTER TABLE public.org_documents
      ADD CONSTRAINT org_documents_category_check
      CHECK (category IN ('תפעול', 'בטיחות', 'מסמכים אישיים'));
  END IF;
END $$;

WITH seed_data AS (
  SELECT *
  FROM (
    VALUES
      (
        'טופס מבחן מעשי',
        'הערכת נהיגה מעשית לפני קבלת רכב חברה.',
        'בטיחות',
        ARRAY[]::text[],
        '{"type":"object","title":"טופס מבחן מעשי","required":["employee_name","id_number","vehicle_number","date","vehicle_control","observation","traffic_sign_compliance"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"vehicle_control":{"type":"integer","title":"שליטה ברכב (1-5)","minimum":1,"maximum":5},"observation":{"type":"integer","title":"הסתכלות (1-5)","minimum":1,"maximum":5},"traffic_sign_compliance":{"type":"integer","title":"ציות לתמרורים (1-5)","minimum":1,"maximum":5},"tester_notes":{"type":"string","title":"הערות בוחן"}}}'::jsonb,
        false,
        true,
        true,
        10
      ),
      (
        'הצהרת בריאות משפחתית',
        'הצהרת בריאות שנתית לנהג ולשימוש משפחתי ברכב.',
        'בטיחות',
        ARRAY['employee_name','id_number','date']::text[],
        '{"type":"object","title":"הצהרת בריאות משפחתית","required":["employee_name","id_number","date","health_confirm"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"health_confirm":{"type":"boolean","title":"מאשר/ת כשירות רפואית לנהיגה"},"medical_notes":{"type":"string","title":"הערות רפואיות"}}}'::jsonb,
        false,
        true,
        true,
        20
      ),
      (
        'בקשה לשדרוג רכב',
        'בקשת עובד לשדרוג רכב חברה.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"בקשה לשדרוג רכב","required":["employee_name","id_number","vehicle_number","date","upgrade_reason"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב נוכחי","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"upgrade_reason":{"type":"string","title":"סיבת הבקשה"},"requested_model":{"type":"string","title":"דגם מבוקש"}}}'::jsonb,
        false,
        true,
        false,
        30
      ),
      (
        'טופס מסירת רכב',
        'אימות קבלת רכב ואביזרים בעת מסירה.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס מסירת רכב","required":["employee_name","id_number","vehicle_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"}}}'::jsonb,
        true,
        true,
        true,
        40
      ),
      (
        'טופס החזרת רכב',
        'אימות החזרת רכב ואביזרים בתום שימוש.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס החזרת רכב","required":["employee_name","id_number","vehicle_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"damage_notes":{"type":"string","title":"הערות נזק"}}}'::jsonb,
        true,
        true,
        true,
        50
      ),
      (
        'טופס עדכון פרטים אישיים',
        'עדכון פרטים אישיים ופרטי התקשרות של הנהג.',
        'מסמכים אישיים',
        ARRAY['employee_name','id_number','date']::text[],
        '{"type":"object","title":"טופס עדכון פרטים אישיים","required":["employee_name","id_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"phone":{"type":"string","title":"טלפון"},"email":{"type":"string","title":"אימייל"},"address":{"type":"string","title":"כתובת"}}}'::jsonb,
        false,
        true,
        false,
        60
      ),
      (
        'הצהרת נהג מורשה למשפחה',
        'הצהרת שימוש ברכב על ידי בני משפחה מורשים.',
        'מסמכים אישיים',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"הצהרת נהג מורשה למשפחה","required":["employee_name","id_number","vehicle_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"family_driver_name":{"type":"string","title":"שם בן משפחה"},"family_driver_id":{"type":"string","title":"ת.ז בן משפחה"}}}'::jsonb,
        false,
        true,
        true,
        70
      )
  ) AS t(
    title,
    description,
    category,
    autofill_fields,
    json_schema,
    include_in_handover,
    is_standalone,
    requires_signature,
    sort_order
  )
),
updated_rows AS (
  UPDATE public.org_documents d
  SET
    description = s.description,
    category = s.category,
    autofill_fields = s.autofill_fields,
    json_schema = s.json_schema,
    include_in_handover = s.include_in_handover,
    is_standalone = s.is_standalone,
    requires_signature = s.requires_signature,
    sort_order = s.sort_order,
    is_active = true,
    updated_at = now()
  FROM seed_data s
  WHERE d.title = s.title
  RETURNING d.title
)
INSERT INTO public.org_documents (
  title,
  description,
  category,
  autofill_fields,
  json_schema,
  include_in_handover,
  is_standalone,
  requires_signature,
  sort_order,
  is_active
)
SELECT
  s.title,
  s.description,
  s.category,
  s.autofill_fields,
  s.json_schema,
  s.include_in_handover,
  s.is_standalone,
  s.requires_signature,
  s.sort_order,
  true
FROM seed_data s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.org_documents d
  WHERE d.title = s.title
);

-- =============================================================================
-- FILE: 20260308194000_forms_center_seed_extra_docs.sql
-- =============================================================================

-- Add 3 more forms so Forms Center includes 10 seeded records

WITH extra_seed AS (
  SELECT *
  FROM (
    VALUES
      (
        'טופס אישור נסיעה חריגה',
        'בקשה ואישור לנסיעה חריגה מחוץ למסגרת השגרה.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס אישור נסיעה חריגה","required":["employee_name","id_number","vehicle_number","date","exception_reason"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"exception_reason":{"type":"string","title":"סיבת החריגה"}}}'::jsonb,
        true,
        true,
        true,
        80
      ),
      (
        'טופס דיווח כמעט-תאונה',
        'דיווח בטיחותי על אירוע כמעט-תאונה ללא נזק בפועל.',
        'בטיחות',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס דיווח כמעט-תאונה","required":["employee_name","id_number","vehicle_number","date","incident_description"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"incident_description":{"type":"string","title":"תיאור האירוע"}}}'::jsonb,
        false,
        true,
        true,
        90
      ),
      (
        'טופס הצהרת פרטיות נהג',
        'אישור נהג לעיבוד נתונים ושמירה על פרטיות.',
        'מסמכים אישיים',
        ARRAY['employee_name','id_number','date']::text[],
        '{"type":"object","title":"טופס הצהרת פרטיות נהג","required":["employee_name","id_number","date","consent"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"consent":{"type":"boolean","title":"מאשר/ת את מדיניות הפרטיות"}}}'::jsonb,
        false,
        true,
        false,
        100
      )
  ) AS t(
    title,
    description,
    category,
    autofill_fields,
    json_schema,
    include_in_handover,
    is_standalone,
    requires_signature,
    sort_order
  )
),
updated_rows AS (
  UPDATE public.org_documents d
  SET
    description = s.description,
    category = s.category,
    autofill_fields = s.autofill_fields,
    json_schema = s.json_schema,
    include_in_handover = s.include_in_handover,
    is_standalone = s.is_standalone,
    requires_signature = s.requires_signature,
    sort_order = s.sort_order,
    is_active = true,
    updated_at = now()
  FROM extra_seed s
  WHERE d.title = s.title
  RETURNING d.title
)
INSERT INTO public.org_documents (
  title,
  description,
  category,
  autofill_fields,
  json_schema,
  include_in_handover,
  is_standalone,
  requires_signature,
  sort_order,
  is_active
)
SELECT
  s.title,
  s.description,
  s.category,
  s.autofill_fields,
  s.json_schema,
  s.include_in_handover,
  s.is_standalone,
  s.requires_signature,
  s.sort_order,
  true
FROM extra_seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.org_documents d
  WHERE d.title = s.title
);

-- =============================================================================
-- FILE: 20260308201000_attach_seed_form_pdf_urls.sql
-- =============================================================================

-- Attach placeholder PDF URLs to seeded forms so download buttons are active

UPDATE public.org_documents
SET
  file_url = '/forms-files/form-practical-test.pdf',
  updated_at = now()
WHERE title = 'טופס מבחן מעשי';

UPDATE public.org_documents
SET
  file_url = '/forms-files/family-health-declaration.pdf',
  updated_at = now()
WHERE title = 'הצהרת בריאות משפחתית';

UPDATE public.org_documents
SET
  file_url = '/forms-files/vehicle-upgrade-request.pdf',
  updated_at = now()
WHERE title = 'בקשה לשדרוג רכב';

UPDATE public.org_documents
SET
  file_url = '/forms-files/vehicle-delivery-form.pdf',
  updated_at = now()
WHERE title = 'טופס מסירת רכב';

UPDATE public.org_documents
SET
  file_url = '/forms-files/vehicle-return-form.pdf',
  updated_at = now()
WHERE title = 'טופס החזרת רכב';

UPDATE public.org_documents
SET
  file_url = '/forms-files/personal-details-update.pdf',
  updated_at = now()
WHERE title = 'טופס עדכון פרטים אישיים';

UPDATE public.org_documents
SET
  file_url = '/forms-files/family-authorized-driver.pdf',
  updated_at = now()
WHERE title = 'הצהרת נהג מורשה למשפחה';

UPDATE public.org_documents
SET
  file_url = '/forms-files/exception-travel-approval.pdf',
  updated_at = now()
WHERE title = 'טופס אישור נסיעה חריגה';

UPDATE public.org_documents
SET
  file_url = '/forms-files/near-accident-report.pdf',
  updated_at = now()
WHERE title = 'טופס דיווח כמעט-תאונה';

UPDATE public.org_documents
SET
  file_url = '/forms-files/driver-privacy-declaration.pdf',
  updated_at = now()
WHERE title = 'טופס הצהרת פרטיות נהג';

-- =============================================================================
-- FILE: 20260308213000_set_forms_admin_email.sql
-- =============================================================================

-- Ensure forms manager email is present for upload visibility fallback

DO $$
DECLARE
  existing_id uuid;
  existing_admin_email text;
BEGIN
  SELECT id, admin_email
  INTO existing_id, existing_admin_email
  FROM public.organization_settings
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.organization_settings (admin_email)
    VALUES ('malachiroei@gmail.com');
  ELSE
    IF position('malachiroei@gmail.com' in coalesce(existing_admin_email, '')) = 0 THEN
      UPDATE public.organization_settings
      SET admin_email = trim(both ',' from concat_ws(',', nullif(existing_admin_email, ''), 'malachiroei@gmail.com')),
          updated_at = now()
      WHERE id = existing_id;
    END IF;
  END IF;
END $$;

-- =============================================================================
-- FILE: 20260308223000_fix_handover_trigger_safe_http_request.sql
-- =============================================================================

-- Make driver_documents trigger resilient when supabase_functions schema is unavailable
-- and point webhook URL to the active Supabase project.

create or replace function public.notify_send_handover_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_http_request boolean;
begin
  has_http_request := to_regprocedure('supabase_functions.http_request(text,text,jsonb,jsonb,text)') is not null;

  if has_http_request then
    perform
      supabase_functions.http_request(
        'https://hojopkvnajvexnwolyeu.supabase.co/functions/v1/send-handover-email',
        'POST',
        '{"Content-Type": "application/json"}'::jsonb,
        jsonb_build_object(
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA,
          'record', row_to_json(NEW),
          'old_record', null
        ),
        '10000'
      );
  end if;

  return NEW;
exception
  when others then
    -- Never block INSERT into driver_documents due to webhook plumbing.
    raise notice 'notify_send_handover_email skipped: %', SQLERRM;
    return NEW;
end;
$$;

-- =============================================================================
-- FILE: 20260308235000_org_documents_action_scoping.sql
-- =============================================================================

-- Scope org_documents by handover action (delivery/return)

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS include_in_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_in_return boolean NOT NULL DEFAULT false;

-- Backfill sensible defaults for existing rows
UPDATE public.org_documents
SET include_in_delivery = include_in_handover
WHERE include_in_handover = true
  AND include_in_delivery = false;

UPDATE public.org_documents
SET include_in_return = true,
    include_in_handover = true
WHERE (
  title ILIKE '%החזרת רכב%'
  OR title ILIKE '%החזרה%'
  OR description ILIKE '%החזרה%'
)
AND include_in_return = false;

-- =============================================================================
-- FILE: 20260310120000_vehicle_tires_inspection.sql
-- =============================================================================

-- Per-tire replacement dates + periodic inspection form URL
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tire_change_date_front_right date,
  ADD COLUMN IF NOT EXISTS tire_change_date_front_left  date,
  ADD COLUMN IF NOT EXISTS tire_change_date_rear_right  date,
  ADD COLUMN IF NOT EXISTS tire_change_date_rear_left   date,
  ADD COLUMN IF NOT EXISTS inspection_form_url          text;

COMMENT ON COLUMN public.vehicles.tire_change_date_front_right IS 'תאריך החלפת צמיג קדמי ימין';
COMMENT ON COLUMN public.vehicles.tire_change_date_front_left  IS 'תאריך החלפת צמיג קדמי שמאל';
COMMENT ON COLUMN public.vehicles.tire_change_date_rear_right  IS 'תאריך החלפת צמיג אחורי ימין';
COMMENT ON COLUMN public.vehicles.tire_change_date_rear_left   IS 'תאריך החלפת צמיג אחורי שמאל';
COMMENT ON COLUMN public.vehicles.inspection_form_url          IS 'קישור לטופס ביקורת תקופתית שהועלה';

-- =============================================================================
-- FILE: 20260310140000_organization_settings_add_organization_id.sql
-- =============================================================================

-- Add organization_id FK to organization_settings (DB uses organization_id, not org_id)
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_organization_settings_organization_id
  ON public.organization_settings(organization_id);

COMMENT ON COLUMN public.organization_settings.organization_id IS 'FK to organizations; used to scope settings per org.';

-- =============================================================================
-- FILE: 20260310150000_vehicles_drivers_add_org_id.sql
-- =============================================================================

-- Add org_id to vehicles and drivers so dashboard/list filter by current user's org.
-- Existing rows with NULL org_id will be visible when filtering by org (see app: .or(eq(org_id,X),is(org_id,null))).

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_org_id ON public.vehicles(org_id);
CREATE INDEX IF NOT EXISTS idx_drivers_org_id ON public.drivers(org_id);

COMMENT ON COLUMN public.vehicles.org_id IS 'Organization that owns this vehicle; NULL = legacy row, shown to all orgs until assigned.';
COMMENT ON COLUMN public.drivers.org_id IS 'Organization that owns this driver; NULL = legacy row, shown to all orgs until assigned.';

-- =============================================================================
-- FILE: 20260312120000_drivers_authenticated_update.sql
-- =============================================================================

-- RLS: allow any authenticated user to UPDATE drivers (same openness as SELECT on drivers).
-- Without this, only is_manager() or drivers.user_id = auth.uid() could update — others got 0 rows back.
-- PERMISSIVE is default; this policy adds to existing manager/own-row policies.

DROP POLICY IF EXISTS "Authenticated users can update drivers" ON public.drivers;

CREATE POLICY "Authenticated users can update drivers"
ON public.drivers
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- =============================================================================
-- FILE: 20260312180000_sync_assignment_from_handover.sql
-- =============================================================================

-- Ensure driver_vehicle_assignments + vehicles.assigned_driver_id stay in sync with
-- vehicle_handovers for ALL drivers — same behavior as Roi Malachi after every archive.
-- The INSERT trigger already runs on new handovers; this RPC is called from the app
-- after archive so returns always unassign even if driver_id was wrong/null, and
-- deliveries can backfill a missing assignment row without duplicating.

CREATE OR REPLACE FUNCTION public.sync_assignment_from_handover(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT vehicle_id, driver_id, handover_type, assignment_mode, created_by
  INTO r
  FROM public.vehicle_handovers
  WHERE id = p_handover_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- החזרה: מנקה assigned_driver_id ברכב + סוגר כל שורות assignment פתוחות לרכב (מיד כמו אצל רועי)
  IF r.handover_type = 'return' THEN
    UPDATE public.vehicles
    SET assigned_driver_id = NULL, updated_at = now()
    WHERE id = r.vehicle_id;

    UPDATE public.driver_vehicle_assignments
    SET unassigned_at = now()
    WHERE vehicle_id = r.vehicle_id
      AND unassigned_at IS NULL;

    RETURN;
  END IF;

  -- מסירה קבועה: כמו הטריגר — שיוך נהג לרכב + שורת assignment אחת פעילה לרכב
  IF r.handover_type = 'delivery' AND r.driver_id IS NOT NULL
     AND COALESCE(r.assignment_mode, 'permanent') = 'permanent' THEN

    UPDATE public.vehicles
    SET assigned_driver_id = r.driver_id, updated_at = now()
    WHERE id = r.vehicle_id;

    UPDATE public.driver_vehicle_assignments
    SET unassigned_at = now()
    WHERE vehicle_id = r.vehicle_id
      AND unassigned_at IS NULL;

    INSERT INTO public.driver_vehicle_assignments (vehicle_id, driver_id, assigned_by, notes)
    VALUES (
      r.vehicle_id,
      r.driver_id,
      r.created_by,
      'שיוך אוטומטי ממסירה (סנכרון לאחר ארכוב)'
    );
    RETURN;
  END IF;

  -- מסירה חליפית: רק רישום היסטורי סגור מיד (ללא שיוך קבוע) — כמו בטריגר
  IF r.handover_type = 'delivery' AND r.driver_id IS NOT NULL
     AND COALESCE(r.assignment_mode, 'permanent') = 'replacement' THEN
    INSERT INTO public.driver_vehicle_assignments (
      vehicle_id, driver_id, assigned_by, notes, unassigned_at
    )
    VALUES (
      r.vehicle_id,
      r.driver_id,
      r.created_by,
      'מסירת רכב חליפי (סנכרון לאחר ארכוב)',
      now()
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_assignment_from_handover(uuid) IS
  'Syncs vehicles.assigned_driver_id and driver_vehicle_assignments from vehicle_handovers after archive; call from app so all drivers behave like handover-driven assignment.';

-- Allow authenticated clients to invoke after archiving forms
GRANT EXECUTE ON FUNCTION public.sync_assignment_from_handover(uuid) TO authenticated;

-- =============================================================================
-- FILE: 20260315100000_team_permissions_and_invitations.sql
-- =============================================================================

-- Add permissions column to profiles (JSON object of permission keys -> boolean)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

COMMENT ON COLUMN public.profiles.permissions IS 'JSON object e.g. {"vehicles": true, "drivers": true, "manage_team": true}';

-- Table for pending invitations (Fleet Manager invites by email + permissions)
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  permissions jsonb DEFAULT '{}',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invitations_select_own_org"
  ON public.org_invitations FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_invitations_insert_own_org"
  ON public.org_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_invitations_delete_own_org"
  ON public.org_invitations FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- FILE: 20260315110000_assign_org_from_invitation_on_signup.sql
-- =============================================================================

-- Ensure profiles has org_id (used by RLS and app; may already exist).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.org_id IS 'Organization the user belongs to; set from org_invitations when they sign up with an invited email.';

-- When a new user signs up, if their email matches an org_invitations row, assign that org_id and permissions.
-- This ensures invited users get the inviter's org (and only that org) automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_org_id uuid;
  inv_permissions jsonb;
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'), NEW.email);

    -- If this email was invited, assign org_id and permissions from the invitation (most recent by created_at).
    SELECT oi.org_id, oi.permissions
    INTO inv_org_id, inv_permissions
    FROM public.org_invitations oi
    WHERE lower(trim(oi.email)) = lower(trim(NEW.email))
    ORDER BY oi.created_at DESC
    LIMIT 1;

    IF inv_org_id IS NOT NULL THEN
      UPDATE public.profiles
      SET org_id = inv_org_id,
          permissions = COALESCE(inv_permissions, '{}'::jsonb)
      WHERE user_id = NEW.id;
    END IF;

    -- Default role is viewer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');

    RETURN NEW;
END;
$$;

-- =============================================================================
-- FILE: 20260315130000_mileage_logs_notification_trigger.sql
-- =============================================================================

-- Trigger function: on new mileage_logs row, call send-mileage-notification edge function

create or replace function public.handle_new_mileage_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _payload jsonb;
  _edge_response jsonb;
begin
  _payload := jsonb_build_object(
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', null
  );

  perform
    http((
      'POST',
      current_setting('app.settings.supabase_url', true) || '/functions/v1/send-mileage-notification',
      array[
        ('Content-Type', 'application/json')::http_header,
        ('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true))::http_header
      ],
      'application/json',
      _payload
    ));

  return NEW;
end;
$$;

drop trigger if exists trg_mileage_logs_notify on public.mileage_logs;

create trigger trg_mileage_logs_notify
after insert on public.mileage_logs
for each row
execute function public.handle_new_mileage_log();


-- =============================================================================
-- FILE: 20260315200000_invitee_accept_invitation_policies.sql
-- =============================================================================

-- Allow invitees to see and delete their own invitation (by matching email).
-- This lets a user who was invited accept the invite: SELECT their row, update their profile, then DELETE the invitation.

CREATE POLICY "org_invitations_select_by_invitee_email"
  ON public.org_invitations FOR SELECT
  TO authenticated
  USING (
    lower(trim(email)) = (
      SELECT lower(trim(email)) FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_invitations_delete_by_invitee_email"
  ON public.org_invitations FOR DELETE
  TO authenticated
  USING (
    lower(trim(email)) = (
      SELECT lower(trim(email)) FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- FILE: 20260316000000_org_members_multi_org.sql
-- =============================================================================

-- org_members: which organizations a user belongs to (for multi-org switcher).
-- profiles.org_id remains the "primary" org; org_members is the source of truth for "all orgs I belong to".
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members (org_id);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Users can read their own memberships.
CREATE POLICY "org_members_select_own"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own row (e.g. when accepting an invite).
CREATE POLICY "org_members_insert_own"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Backfill: every profile with org_id gets a row in org_members.
INSERT INTO public.org_members (user_id, org_id)
  SELECT user_id, org_id FROM public.profiles WHERE org_id IS NOT NULL
  ON CONFLICT (user_id, org_id) DO NOTHING;

-- When handle_new_user assigns org from invitation, also add to org_members.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_org_id uuid;
  inv_permissions jsonb;
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'), NEW.email);

    SELECT oi.org_id, oi.permissions
    INTO inv_org_id, inv_permissions
    FROM public.org_invitations oi
    WHERE lower(trim(oi.email)) = lower(trim(NEW.email))
    ORDER BY oi.created_at DESC
    LIMIT 1;

    IF inv_org_id IS NOT NULL THEN
      UPDATE public.profiles
      SET org_id = inv_org_id,
          permissions = COALESCE(inv_permissions, '{}'::jsonb)
      WHERE user_id = NEW.id;

      INSERT INTO public.org_members (user_id, org_id)
      VALUES (NEW.id, inv_org_id)
      ON CONFLICT (user_id, org_id) DO NOTHING;
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');

    RETURN NEW;
END;
$$;

-- =============================================================================
-- FILE: 20260316011000_profiles_status_pending_approval.sql
-- =============================================================================

-- Add status column to profiles for account approval flow.
-- Status values:
--   'pending_approval' - newly registered user without invite, blocked from data
--   'active'           - approved/normal account (including invited users)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_approval'
  CHECK (status IN ('pending_approval', 'active'));

COMMENT ON COLUMN public.profiles.status IS
  'Account status: pending_approval (cannot access data) or active.';

-- Update handle_new_user to set status:
-- - Invited users: status = ''active'' once org is assigned
-- - Non-invited users: keep default ''pending_approval''

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_org_id uuid;
  inv_permissions jsonb;
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'), NEW.email);

    SELECT oi.org_id, oi.permissions
    INTO inv_org_id, inv_permissions
    FROM public.org_invitations oi
    WHERE lower(trim(oi.email)) = lower(trim(NEW.email))
    ORDER BY oi.created_at DESC
    LIMIT 1;

    IF inv_org_id IS NOT NULL THEN
      UPDATE public.profiles
      SET org_id = inv_org_id,
          permissions = COALESCE(inv_permissions, '{}'::jsonb),
          status = 'active'
      WHERE user_id = NEW.id;

      INSERT INTO public.org_members (user_id, org_id)
      VALUES (NEW.id, inv_org_id)
      ON CONFLICT (user_id, org_id) DO NOTHING;
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');

    RETURN NEW;
END;
$$;


-- =============================================================================
-- FILE: 20260316120000_profiles_status_enforce_pending_approval.sql
-- =============================================================================

-- Enforce pending_approval as the default status for all new profiles.
-- Invited users still get org_id and permissions, but remain pending_approval
-- until an admin explicitly approves them.

ALTER TABLE public.profiles
  ALTER COLUMN status SET DEFAULT 'pending_approval';

COMMENT ON COLUMN public.profiles.status IS
  'Account status: pending_approval (cannot access data) or active. New users are always pending_approval until an admin approves.';

-- Override handle_new_user so it NEVER sets status to active automatically.
-- It only attaches org_id/permissions from invitations; status stays at the default.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_org_id uuid;
  inv_permissions jsonb;
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'),
      NEW.email,
      'pending_approval'
    );

    SELECT oi.org_id, oi.permissions
    INTO inv_org_id, inv_permissions
    FROM public.org_invitations oi
    WHERE lower(trim(oi.email)) = lower(trim(NEW.email))
    ORDER BY oi.created_at DESC
    LIMIT 1;

    IF inv_org_id IS NOT NULL THEN
      UPDATE public.profiles
      SET org_id = inv_org_id,
          permissions = COALESCE(inv_permissions, '{}'::jsonb)
      WHERE user_id = NEW.id;

      INSERT INTO public.org_members (user_id, org_id)
      VALUES (NEW.id, inv_org_id)
      ON CONFLICT (user_id, org_id) DO NOTHING;
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');

    RETURN NEW;
END;
$$;


-- =============================================================================
-- FILE: 20260320120000_profiles_parent_admin_id_team_rls.sql
-- =============================================================================

-- Hierarchy: direct manager link (nullable = top-level in org tree).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.parent_admin_id IS 'מנהל ישיר בהיררכיה; NULL = ללא הורה (רמת על בארגון).';

-- Team managers may update peers in the same org (permissions, allowed_features, target_version, parent_admin_id).
DROP POLICY IF EXISTS "profiles_update_same_org_team_manager" ON public.profiles;
CREATE POLICY "profiles_update_same_org_team_manager"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles m
      WHERE m.id = auth.uid()
      AND m.org_id = profiles.org_id
      AND (
        public.is_manager(auth.uid())
        OR COALESCE((m.permissions ->> 'manage_team')::boolean, false) = true
      )
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles m
      WHERE m.id = auth.uid()
      AND m.org_id = profiles.org_id
      AND (
        public.is_manager(auth.uid())
        OR COALESCE((m.permissions ->> 'manage_team')::boolean, false) = true
      )
    )
  );

-- Signup from invitation: set parent_admin_id from inviter (invited_by = auth uid = profiles.id).
-- Must stay aligned with pending_approval + org_members (see 20260316120000).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_org_id uuid;
  inv_permissions jsonb;
  inv_parent uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'משתמש חדש'),
    NEW.email,
    'pending_approval'
  );

  SELECT oi.org_id, oi.permissions, oi.invited_by
  INTO inv_org_id, inv_permissions, inv_parent
  FROM public.org_invitations oi
  WHERE lower(trim(oi.email)) = lower(trim(NEW.email))
  ORDER BY oi.created_at DESC
  LIMIT 1;

  IF inv_org_id IS NOT NULL THEN
    UPDATE public.profiles
    SET org_id = inv_org_id,
        permissions = COALESCE(inv_permissions, '{}'::jsonb),
        parent_admin_id = inv_parent
    WHERE user_id = NEW.id;

    INSERT INTO public.org_members (user_id, org_id)
    VALUES (NEW.id, inv_org_id)
    ON CONFLICT (user_id, org_id) DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer');

  RETURN NEW;
END;
$$;

-- =============================================================================
-- FILE: 20260322120000_org_documents_display_name.sql
-- =============================================================================

-- Optional display name for org forms (app uses COALESCE(name, title))
ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN public.org_documents.name IS 'שם תצוגה לטפסים; אם NULL — משתמשים ב-title';

-- =============================================================================
-- FILE: 20260323120000_organizations_release_snapshot_ack.sql
-- =============================================================================

-- גשר סנכרון הגדרות (Git snapshot): גרסת ACK לארגון בפרודקשן
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS release_snapshot_ack_version TEXT NOT NULL DEFAULT '0.0.0';

COMMENT ON COLUMN public.organizations.release_snapshot_ack_version IS
  'גרסת release_snapshot.json שסונכרנה לארגון זה (השוואה מול הקובץ בבנדל).';

-- =============================================================================
-- FILE: 20260324120000_profiles_allowed_features_jsonb.sql
-- =============================================================================

-- Granular access: JSON array of feature keys (e.g. "DAMAGE_REPORT").
-- NULL = not using this column (app falls back to legacy profiles.permissions).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_features jsonb;

COMMENT ON COLUMN public.profiles.allowed_features IS
  'JSON array of strings, e.g. ["DAMAGE_REPORT","VIEW_REPORTS"]. NULL = legacy permissions only; [] = no features from this system.';

-- =============================================================================
-- FILE: 20260324153000_profiles_select_same_org_team_managers.sql
-- =============================================================================

-- Allow fleet users with manage_team (same org) to SELECT peer profiles, not only is_manager().
-- Fixes team page: invited users who signed up appear in profiles but were invisible to org managers
-- who are not admin/fleet_manager in user_roles.

CREATE POLICY "profiles_select_same_org_team_manager"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles m
      WHERE m.id = auth.uid()
      AND m.org_id IS NOT NULL
      AND profiles.org_id IS NOT NULL
      AND m.org_id = profiles.org_id
      AND (
        public.is_manager(auth.uid())
        OR COALESCE((m.permissions ->> 'manage_team')::boolean, false) = true
      )
    )
  );

COMMENT ON POLICY "profiles_select_same_org_team_manager" ON public.profiles IS
  'Same-org team leads can list profiles for ניהול צוות (in addition to global is_manager policy).';

-- =============================================================================
-- FILE: 20260325120000_vehicles_drivers_managed_by_user.sql
-- =============================================================================

-- Per-manager fleet slice within the same org:
-- NULL = legacy / shared — visible to all managers in the org.
-- Non-null = only that user (profiles.id / auth.uid()) sees the row in fleet lists,
--            and View As that user sees it; other managers do not.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS managed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS managed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_managed_by_user_id ON public.vehicles (managed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_managed_by_user_id ON public.drivers (managed_by_user_id);

COMMENT ON COLUMN public.vehicles.managed_by_user_id IS 'Fleet manager owner; NULL = all org managers may list this vehicle.';
COMMENT ON COLUMN public.drivers.managed_by_user_id IS 'Fleet manager owner; NULL = all org managers may list this driver.';

-- =============================================================================
-- FILE: 20260325140000_user_feature_overrides_rls_same_org.sql
-- =============================================================================

-- RLS: override לפיצ'רים — בעלים + admin/fleet_manager באותו org כמו היעד
-- מתאים ל-UserFeatureFlagsOverridesDialog (user_id = auth.users.id = profiles.id)

ALTER TABLE public.user_feature_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_feature_overrides_own" ON public.user_feature_overrides;
DROP POLICY IF EXISTS "user_feature_overrides_same_org_staff" ON public.user_feature_overrides;
DROP POLICY IF EXISTS "Users can view own overrides" ON public.user_feature_overrides;
DROP POLICY IF EXISTS "Admins can manage overrides" ON public.user_feature_overrides;

CREATE POLICY "user_feature_overrides_own"
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_feature_overrides_same_org_staff"
  ON public.user_feature_overrides
  FOR ALL
  TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles them ON them.id = user_feature_overrides.user_id
      WHERE me.id = auth.uid()
        AND me.org_id IS NOT NULL
        AND them.org_id = me.org_id
    )
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'fleet_manager'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles them ON them.id = user_feature_overrides.user_id
      WHERE me.id = auth.uid()
        AND me.org_id IS NOT NULL
        AND them.org_id = me.org_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feature_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feature_overrides TO service_role;

-- =============================================================================
-- FILE: 20260326170000_profiles_managed_by_user.sql
-- =============================================================================

-- Manager hierarchy: direct manager per profile.
-- NULL means top-level/unmanaged profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS managed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_managed_by_user_id
  ON public.profiles (managed_by_user_id);

COMMENT ON COLUMN public.profiles.managed_by_user_id IS
  'Direct manager profile id (profiles.id). NULL = unmanaged/top-level; visible only to system admins in team list.';

-- =============================================================================
-- FILE: 20260328120000_vehicles_service_interval_km.sql
-- =============================================================================

-- Manufacturer-recommended service interval (e.g. 15000 km)
alter table public.vehicles
  add column if not exists service_interval_km integer null;

comment on column public.vehicles.service_interval_km is
  'Recommended interval between services in km (manufacturer guideline, e.g. 15000).';

-- =============================================================================
-- FILE: 20260328140000_feature_flag_qa_service_update.sql
-- =============================================================================

-- Feature flag: עדכון טיפול (service update form + quick links)
insert into public.feature_flags (feature_key, display_name_he, description, category, is_enabled_globally)
values (
  'qa_service_update',
  'עדכון טיפול',
  'רישום טיפול, חישוב טיפול הבא ומסך עדכון טיפול ברשימת רכבים',
  'quick_actions',
  true
)
on conflict (feature_key) do nothing;

-- =============================================================================
-- FILE: 20260330120000_fix_mileage_reports_upload_policy.sql
-- =============================================================================

-- Allow any authenticated user to READ/UPLOAD mileage report photos.
-- (Matches the pattern used for 'vehicle-documents' bucket policies.)

-- Ensure bucket exists (non-destructive if it already exists).
insert into storage.buckets (id, name, public)
values ('mileage-reports', 'mileage-reports', true)
on conflict (id) do nothing;

-- Storage RLS policies for the 'mileage-reports' bucket
drop policy if exists "mileage_reports_select_authenticated" on storage.objects;
drop policy if exists "mileage_reports_insert_authenticated" on storage.objects;

create policy "mileage_reports_select_authenticated"
on storage.objects for select
using (bucket_id = 'mileage-reports' and auth.uid() is not null);

create policy "mileage_reports_insert_authenticated"
on storage.objects for insert
with check (bucket_id = 'mileage-reports' and auth.uid() is not null);


-- =============================================================================
-- FILE: 20260330140000_mileage_reports_storage_update_policy.sql
-- =============================================================================

-- storage.upload(..., { upsert: true }) may UPDATE an existing object; grant it for mileage-reports.

drop policy if exists "mileage_reports_update_authenticated" on storage.objects;

create policy "mileage_reports_update_authenticated"
on storage.objects for update
using (bucket_id = 'mileage-reports' and auth.uid() is not null)
with check (bucket_id = 'mileage-reports' and auth.uid() is not null);

-- =============================================================================
-- FILE: 20260330160000_mileage_logs_rls_authenticated.sql
-- =============================================================================

-- Allow authenticated users to insert mileage reports and read back the inserted row (.select after insert).
-- Aligns with ReportMileagePage: user_id = auth.uid(), vehicle_id references vehicles in the user's org
-- (or legacy vehicles with org_id IS NULL).

alter table public.mileage_logs enable row level security;

drop policy if exists "mileage_logs_insert_authenticated" on public.mileage_logs;
drop policy if exists "mileage_logs_select_authenticated" on public.mileage_logs;

create policy "mileage_logs_insert_authenticated"
  on public.mileage_logs
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and (
          (
            v.org_id is not null
            and exists (
              select 1
              from public.org_members om
              where om.org_id = v.org_id
                and om.user_id = auth.uid()
            )
          )
          or v.org_id is null
        )
    )
  );

create policy "mileage_logs_select_authenticated"
  on public.mileage_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and (
          (
            v.org_id is not null
            and exists (
              select 1
              from public.org_members om
              where om.org_id = v.org_id
                and om.user_id = auth.uid()
            )
          )
          or v.org_id is null
        )
    )
  );

grant select, insert on public.mileage_logs to authenticated;

-- =============================================================================
-- FILE: 20260330180000_mileage_reports_storage_public_read.sql
-- =============================================================================

-- Bucket is public; browser <img src={getPublicUrl(...)}> does not send Supabase JWT.
-- Previous policy required auth.uid() for SELECT, which blocked anonymous GET of public URLs.

drop policy if exists "mileage_reports_select_authenticated" on storage.objects;

create policy "mileage_reports_select_public_bucket"
on storage.objects
for select
using (bucket_id = 'mileage-reports');

-- =============================================================================
-- FILE: 20260331120000_ui_settings_rls_org_admins.sql
-- =============================================================================

-- ui_settings: טבלת טפסי הצהרת בריאות / מדיניות רכב וכו׳ (ממופה ב-useOrgSettings → ui_settings).
-- בפרודקשן לעיתים חסרות מדיניות RLS או הטבלה עצמה — מתקבל 403 מ-PostgREST בעת שמירה.
--
-- מדיניות (ללא org_members — תואם פרויקטים ללא הטבלה):
-- · קריאה: profiles.org_id של המשתמש תואם ל-org_id בשורת ui_settings.
-- · כתיבה: אותו תנאי + (is_manager מ-user_roles או admin_access/manage_team ב-profiles.permissions).

-- ── טבלה (אם עדיין לא קיימת בסביבה) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ui_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_name text NOT NULL DEFAULT '',
  org_id_number text NOT NULL DEFAULT '',
  admin_email text NOT NULL DEFAULT '',
  health_statement_text text NOT NULL DEFAULT '',
  vehicle_policy_text text NOT NULL DEFAULT '',
  health_statement_pdf_url text,
  vehicle_policy_pdf_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ui_settings_org_id_key ON public.ui_settings (org_id);
CREATE INDEX IF NOT EXISTS ui_settings_org_id_idx ON public.ui_settings (org_id);

-- עמודות PDF — אם הטבלה כבר הייתה מגרסה ישנה בלי העמודות
ALTER TABLE public.ui_settings
  ADD COLUMN IF NOT EXISTS health_statement_pdf_url text;
ALTER TABLE public.ui_settings
  ADD COLUMN IF NOT EXISTS vehicle_policy_pdf_url text;

ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;

-- הסרת מדיניות ישנות/פתוחות מסקריפטי תיקון (כדי שלא תישאר רק "כתיבה לכולם" ללא סינון, או כפילויות)
DROP POLICY IF EXISTS "authenticated read ui_settings" ON public.ui_settings;
DROP POLICY IF EXISTS "authenticated write ui_settings" ON public.ui_settings;

-- ── פונקציות עזר (SECURITY DEFINER — עוקף RLS על טבלאות המשנה) ──────────────
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.org_id IS NOT NULL
      AND p.org_id = _org_id
  );
$$;

COMMENT ON FUNCTION public.user_belongs_to_org(uuid, uuid) IS
  'True if profiles.org_id matches the row org (no org_members required).';

CREATE OR REPLACE FUNCTION public.can_edit_org_ui_settings(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_belongs_to_org(_user_id, _org_id)
    AND (
      public.is_manager(_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = _user_id
          AND (
            COALESCE((p.permissions ->> 'admin_access')::boolean, false)
            OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
          )
      )
    );
$$;

COMMENT ON FUNCTION public.can_edit_org_ui_settings(uuid, uuid) IS
  'Fleet/org admins: user_roles admin|fleet_manager OR profiles admin_access|manage_team.';

GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_org_ui_settings(uuid, uuid) TO authenticated;

-- ── מדיניות RLS על ui_settings ──────────────────────────────────────────────
DROP POLICY IF EXISTS "ui_settings_select_org_member" ON public.ui_settings;
CREATE POLICY "ui_settings_select_org_member"
  ON public.ui_settings
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), org_id));

DROP POLICY IF EXISTS "ui_settings_insert_org_admin" ON public.ui_settings;
CREATE POLICY "ui_settings_insert_org_admin"
  ON public.ui_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_org_ui_settings(auth.uid(), org_id));

DROP POLICY IF EXISTS "ui_settings_update_org_admin" ON public.ui_settings;
CREATE POLICY "ui_settings_update_org_admin"
  ON public.ui_settings
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_org_ui_settings(auth.uid(), org_id))
  WITH CHECK (public.can_edit_org_ui_settings(auth.uid(), org_id));

DROP POLICY IF EXISTS "ui_settings_delete_org_admin" ON public.ui_settings;
CREATE POLICY "ui_settings_delete_org_admin"
  ON public.ui_settings
  FOR DELETE
  TO authenticated
  USING (public.can_edit_org_ui_settings(auth.uid(), org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_settings TO service_role;

-- ── system_settings: לוודא שמדיניות כתיבה ל-authenticated קיימת (יישום העלאת JSON וכו׳) ──
-- אם כבר קיימת — DROP/CREATE יחליפו באותו אופן.
DROP POLICY IF EXISTS "authenticated can select system_settings" ON public.system_settings;
CREATE POLICY "authenticated can select system_settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated can upsert system_settings" ON public.system_settings;
CREATE POLICY "authenticated can upsert system_settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;

-- =============================================================================
-- FILE: 20260401140000_rls_org_scope_and_anon_hardening.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS hardening: org-scoped SELECT for authenticated; writes for org admins.
--
-- · Expands user_belongs_to_org() to include org_members (multi-org) + profiles.org_id.
-- · Adds user_has_fleet_staff_privileges() + can_org_admin_write() (no dependency on is_manager()).
-- · Replaces permissive policies on core fleet tables (vehicles, drivers, org_documents,
--   ui_settings already uses helpers — they pick up the new user_belongs_to_org).
-- · Splits system_settings writes from open FOR ALL.
-- · REVOKE ALL from anon on public tables/sequences (no PostgREST exposure for anon).
-- · Each table’s RLS/policies run only if information_schema.tables has the table.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: membership in an organization (primary profile org OR org_members) ─
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _org_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = _user_id
          AND p.org_id IS NOT NULL
          AND p.org_id = _org_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.org_members m
        WHERE m.user_id = _user_id
          AND m.org_id = _org_id
      )
    );
$$;

COMMENT ON FUNCTION public.user_belongs_to_org(uuid, uuid) IS
  'True if profiles.org_id or org_members grants access to _org_id.';

-- ── Helper: fleet staff without calling is_manager() (user_roles + profiles JSON) ─
CREATE OR REPLACE FUNCTION public.user_has_fleet_staff_privileges(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text IN ('admin', 'fleet_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _user_id
        AND (
          COALESCE((p.permissions ->> 'admin_access')::boolean, false)
          OR COALESCE((p.permissions ->> 'manage_team')::boolean, false)
        )
    );
$$;

COMMENT ON FUNCTION public.user_has_fleet_staff_privileges(uuid) IS
  'True if user_roles has admin/fleet_manager OR profiles.permissions admin_access/manage_team.';

GRANT EXECUTE ON FUNCTION public.user_has_fleet_staff_privileges(uuid) TO authenticated;

-- ── Helper: may INSERT/UPDATE/DELETE org-scoped fleet / settings rows ─────────
CREATE OR REPLACE FUNCTION public.can_org_admin_write(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _org_id IS NULL THEN
      public.user_has_fleet_staff_privileges(_user_id)
    ELSE
      public.user_belongs_to_org(_user_id, _org_id)
      AND public.user_has_fleet_staff_privileges(_user_id)
  END;
$$;

COMMENT ON FUNCTION public.can_org_admin_write(uuid, uuid) IS
  'Org-scoped write: in org + fleet staff (user_roles admin/fleet_manager OR profiles admin_access/manage_team). Legacy NULL org_id: staff only.';

GRANT EXECUTE ON FUNCTION public.can_org_admin_write(uuid, uuid) TO authenticated;

-- ── Drop all policies on tables we recreate (names vary across historical migrations) ─
DO $$
DECLARE
  t text;
  pol text;
  tables text[] := ARRAY[
    'vehicles',
    'drivers',
    'maintenance_logs',
    'vehicle_handovers',
    'compliance_alerts',
    'driver_documents',
    'driver_vehicle_assignments',
    'pricing_data',
    'procedure6_complaints',
    'vehicle_expenses',
    'vehicle_incidents',
    'vehicle_documents',
    'org_documents',
    'organization_settings',
    'ui_customization',
    'feature_flags',
    'organizations',
    'driver_family_members',
    'driver_incidents',
    'mileage_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;
  END LOOP;
END $$;

-- ── organizations ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    EXECUTE 'ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY';
    EXECUTE $sql$
      CREATE POLICY "organizations_select_same_org"
        ON public.organizations FOR SELECT TO authenticated
        USING (public.user_belongs_to_org(auth.uid(), id));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "organizations_insert_org_admins"
        ON public.organizations FOR INSERT TO authenticated
        WITH CHECK (public.can_org_admin_write(auth.uid(), id));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "organizations_update_org_admins"
        ON public.organizations FOR UPDATE TO authenticated
        USING (public.can_org_admin_write(auth.uid(), id))
        WITH CHECK (public.can_org_admin_write(auth.uid(), id));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "organizations_delete_org_admins"
        ON public.organizations FOR DELETE TO authenticated
        USING (public.can_org_admin_write(auth.uid(), id));
    $sql$;
  END IF;
END $$;

-- ── vehicles ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicles'
  ) THEN
    ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicles_select_org_scope"
      ON public.vehicles FOR SELECT TO authenticated
      USING (
        (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
        AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
      );
    CREATE POLICY "vehicles_insert_org_admins"
      ON public.vehicles FOR INSERT TO authenticated
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "vehicles_update_org_admins"
      ON public.vehicles FOR UPDATE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      )
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "vehicles_delete_org_admins"
      ON public.vehicles FOR DELETE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "vehicles_update_assigned_driver_odometer"
      ON public.vehicles FOR UPDATE TO authenticated
      USING (
        assigned_driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid())
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      )
      WITH CHECK (
        assigned_driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid())
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      );
  END IF;
END $$;

-- ── drivers ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'drivers'
  ) THEN
    ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "drivers_select_org_scope"
      ON public.drivers FOR SELECT TO authenticated
      USING (
        (user_id IS NOT NULL AND user_id = auth.uid())
        OR (
          (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
          AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
        )
        OR (
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text = 'viewer'
          )
          AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
          AND (managed_by_user_id IS NULL OR managed_by_user_id = auth.uid())
        )
      );
    CREATE POLICY "drivers_insert_org_admins"
      ON public.drivers FOR INSERT TO authenticated
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "drivers_update_org_admins"
      ON public.drivers FOR UPDATE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      )
      WITH CHECK (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
    CREATE POLICY "drivers_update_own_linked_user"
      ON public.drivers FOR UPDATE TO authenticated
      USING (
        user_id IS NOT NULL
        AND user_id = auth.uid()
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      )
      WITH CHECK (
        user_id IS NOT NULL
        AND user_id = auth.uid()
        AND (org_id IS NULL OR public.user_belongs_to_org(auth.uid(), org_id))
      );
    CREATE POLICY "drivers_delete_org_admins"
      ON public.drivers FOR DELETE TO authenticated
      USING (
        (org_id IS NOT NULL AND public.can_org_admin_write(auth.uid(), org_id))
        OR (org_id IS NULL AND public.can_org_admin_write(auth.uid(), NULL))
      );
  END IF;
END $$;

-- ── org_documents (no org_id column — global forms per deployment) ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_documents'
  ) THEN
    ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "org_documents_select_authenticated"
      ON public.org_documents FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
    CREATE POLICY "org_documents_insert_staff"
      ON public.org_documents FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "org_documents_update_staff"
      ON public.org_documents FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "org_documents_delete_staff"
      ON public.org_documents FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── ui_settings: policies already reference user_belongs_to_org / can_edit_org_ui_settings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ui_settings'
  ) THEN
    ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ── organization_settings (per-row organization_id when present) ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_settings'
  ) THEN
    ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organization_settings'
        AND column_name = 'organization_id'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY "organization_settings_select_same_org"
          ON public.organization_settings FOR SELECT TO authenticated
          USING (
            organization_id IS NULL
            OR public.user_belongs_to_org(auth.uid(), organization_id)
          );
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_insert_org_admins"
          ON public.organization_settings FOR INSERT TO authenticated
          WITH CHECK (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          );
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_update_org_admins"
          ON public.organization_settings FOR UPDATE TO authenticated
          USING (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          )
          WITH CHECK (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          );
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_delete_org_admins"
          ON public.organization_settings FOR DELETE TO authenticated
          USING (
            organization_id IS NOT NULL
            AND public.can_org_admin_write(auth.uid(), organization_id)
          );
      $sql$;
    ELSE
      EXECUTE $sql$
        CREATE POLICY "organization_settings_select_authenticated"
          ON public.organization_settings FOR SELECT TO authenticated
          USING (auth.uid() IS NOT NULL);
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_insert_staff"
          ON public.organization_settings FOR INSERT TO authenticated
          WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())));
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_update_staff"
          ON public.organization_settings FOR UPDATE TO authenticated
          USING (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())))
          WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())));
      $sql$;
      EXECUTE $sql$
        CREATE POLICY "organization_settings_delete_staff"
          ON public.organization_settings FOR DELETE TO authenticated
          USING (public.can_org_admin_write(auth.uid(), (SELECT org_id FROM public.profiles WHERE id = auth.uid())));
      $sql$;
    END IF;
  END IF;
END $$;

-- ── ui_customization (singleton-style labels — writes limited to staff) ─────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ui_customization'
  ) THEN
    ALTER TABLE public.ui_customization ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "ui_customization_select_authenticated"
      ON public.ui_customization FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
    CREATE POLICY "ui_customization_insert_staff"
      ON public.ui_customization FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "ui_customization_update_staff"
      ON public.ui_customization FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "ui_customization_delete_staff"
      ON public.ui_customization FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── feature_flags (read for app; mutate only staff) ───────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags'
  ) THEN
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "feature_flags_select_authenticated"
      ON public.feature_flags FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
    CREATE POLICY "feature_flags_insert_staff"
      ON public.feature_flags FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "feature_flags_update_staff"
      ON public.feature_flags FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "feature_flags_delete_staff"
      ON public.feature_flags FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── system_settings: keep broad read; restrict writes ─────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    EXECUTE 'ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated can upsert system_settings" ON public.system_settings';
    EXECUTE $sql$
      CREATE POLICY "system_settings_insert_staff"
        ON public.system_settings FOR INSERT TO authenticated
        WITH CHECK (public.user_has_fleet_staff_privileges(auth.uid()));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "system_settings_update_staff"
        ON public.system_settings FOR UPDATE TO authenticated
        USING (public.user_has_fleet_staff_privileges(auth.uid()))
        WITH CHECK (public.user_has_fleet_staff_privileges(auth.uid()));
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "system_settings_delete_staff"
        ON public.system_settings FOR DELETE TO authenticated
        USING (public.user_has_fleet_staff_privileges(auth.uid()));
    $sql$;
  END IF;
END $$;

-- ── maintenance_logs (via vehicle org) ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'maintenance_logs'
  ) THEN
    ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "maintenance_logs_select_same_org"
      ON public.maintenance_logs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "maintenance_logs_insert_org_admins"
      ON public.maintenance_logs FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "maintenance_logs_update_org_admins"
      ON public.maintenance_logs FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "maintenance_logs_delete_org_admins"
      ON public.maintenance_logs FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = maintenance_logs.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── vehicle_handovers ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_handovers'
  ) THEN
    ALTER TABLE public.vehicle_handovers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_handovers_select_same_org"
      ON public.vehicle_handovers FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_handovers_insert_org_participants"
      ON public.vehicle_handovers FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
            AND (
              EXISTS (
                SELECT 1
                FROM public.user_roles ur
                WHERE ur.user_id = auth.uid()
                  AND ur.role::text = 'driver'
              )
              OR public.can_org_admin_write(auth.uid(), v.org_id)
            )
        )
      );
    CREATE POLICY "vehicle_handovers_update_org_admins"
      ON public.vehicle_handovers FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_handovers_delete_org_admins"
      ON public.vehicle_handovers FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_handovers.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── compliance_alerts ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_alerts'
  ) THEN
    ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "compliance_alerts_select_same_org"
      ON public.compliance_alerts FOR SELECT TO authenticated
      USING (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
          )
        )
      );
    CREATE POLICY "compliance_alerts_insert_org_admins"
      ON public.compliance_alerts FOR INSERT TO authenticated
      WITH CHECK (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      );
    CREATE POLICY "compliance_alerts_update_org_admins"
      ON public.compliance_alerts FOR UPDATE TO authenticated
      USING (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      )
      WITH CHECK (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      );
    CREATE POLICY "compliance_alerts_delete_org_admins"
      ON public.compliance_alerts FOR DELETE TO authenticated
      USING (
        (
          entity_type = 'vehicle'
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), v.org_id)
          )
        )
        OR (
          entity_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = compliance_alerts.entity_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
      );
  END IF;
END $$;

-- ── driver_documents ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_documents'
  ) THEN
    ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "driver_documents_select_same_org"
      ON public.driver_documents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND (
              (d.user_id IS NOT NULL AND d.user_id = auth.uid())
              OR (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
            )
        )
      );
    CREATE POLICY "driver_documents_insert_org_admins"
      ON public.driver_documents FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      );
    CREATE POLICY "driver_documents_update_org_admins"
      ON public.driver_documents FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      );
    CREATE POLICY "driver_documents_delete_org_admins"
      ON public.driver_documents FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = driver_documents.driver_id
            AND public.can_org_admin_write(auth.uid(), d.org_id)
        )
      );
  END IF;
END $$;

-- ── driver_vehicle_assignments ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_vehicle_assignments'
  ) THEN
    ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "assignments_select_same_org"
      ON public.driver_vehicle_assignments FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "assignments_insert_org_admins"
      ON public.driver_vehicle_assignments FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "assignments_update_org_admins"
      ON public.driver_vehicle_assignments FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "assignments_delete_org_admins"
      ON public.driver_vehicle_assignments FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = driver_vehicle_assignments.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── pricing_data (no org column — staff only for writes) ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pricing_data'
  ) THEN
    ALTER TABLE public.pricing_data ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "pricing_data_select_same_org_users"
      ON public.pricing_data FOR SELECT TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id IS NOT NULL)
      );
    CREATE POLICY "pricing_data_insert_staff"
      ON public.pricing_data FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "pricing_data_update_staff"
      ON public.pricing_data FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "pricing_data_delete_staff"
      ON public.pricing_data FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── procedure6_complaints ───────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'procedure6_complaints'
  ) THEN
    ALTER TABLE public.procedure6_complaints ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "procedure6_select_org_users"
      ON public.procedure6_complaints FOR SELECT TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id IS NOT NULL)
      );
    CREATE POLICY "procedure6_insert_staff"
      ON public.procedure6_complaints FOR INSERT TO authenticated
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "procedure6_update_staff"
      ON public.procedure6_complaints FOR UPDATE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
      WITH CHECK (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
    CREATE POLICY "procedure6_delete_staff"
      ON public.procedure6_complaints FOR DELETE TO authenticated
      USING (public.can_org_admin_write(auth.uid(), (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));
  END IF;
END $$;

-- ── vehicle_expenses / vehicle_incidents ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_expenses'
  ) THEN
    ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_expenses_select_same_org"
      ON public.vehicle_expenses FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_expenses_insert_org_admins"
      ON public.vehicle_expenses FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_expenses_update_org_admins"
      ON public.vehicle_expenses FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_expenses_delete_org_admins"
      ON public.vehicle_expenses FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_expenses.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_incidents'
  ) THEN
    ALTER TABLE public.vehicle_incidents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_incidents_select_same_org"
      ON public.vehicle_incidents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_incidents_insert_org_admins"
      ON public.vehicle_incidents FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_incidents_update_org_admins"
      ON public.vehicle_incidents FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_incidents_delete_org_admins"
      ON public.vehicle_incidents FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_incidents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── vehicle_documents ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vehicle_documents'
  ) THEN
    ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "vehicle_documents_select_same_org"
      ON public.vehicle_documents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
        )
      );
    CREATE POLICY "vehicle_documents_insert_org_admins"
      ON public.vehicle_documents FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_documents_update_org_admins"
      ON public.vehicle_documents FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
    CREATE POLICY "vehicle_documents_delete_org_admins"
      ON public.vehicle_documents FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.vehicles v
          WHERE v.id = vehicle_documents.vehicle_id
            AND public.can_org_admin_write(auth.uid(), v.org_id)
        )
      );
  END IF;
END $$;

-- ── driver_family_members / driver_incidents ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_family_members'
  ) THEN
    ALTER TABLE public.driver_family_members ENABLE ROW LEVEL SECURITY;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_select_same_org"
        ON public.driver_family_members FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_insert_org_admins"
        ON public.driver_family_members FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_update_org_admins"
        ON public.driver_family_members FOR UPDATE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_family_members_delete_org_admins"
        ON public.driver_family_members FOR DELETE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_family_members.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_incidents'
  ) THEN
    ALTER TABLE public.driver_incidents ENABLE ROW LEVEL SECURITY;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_select_same_org"
        ON public.driver_incidents FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND (d.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), d.org_id))
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_insert_org_admins"
        ON public.driver_incidents FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_update_org_admins"
        ON public.driver_incidents FOR UPDATE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "driver_incidents_delete_org_admins"
        ON public.driver_incidents FOR DELETE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.id = driver_incidents.driver_id
              AND public.can_org_admin_write(auth.uid(), d.org_id)
          )
        );
    $sql$;
  END IF;
END $$;

-- ── mileage_logs (align with user_belongs_to_org + vehicle org) ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mileage_logs'
  ) THEN
    ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;
    EXECUTE $sql$
      CREATE POLICY "mileage_logs_insert_authenticated"
        ON public.mileage_logs FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND user_id = auth.uid()
          AND EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = mileage_logs.vehicle_id
              AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
          )
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "mileage_logs_select_authenticated"
        ON public.mileage_logs FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.vehicles v
            WHERE v.id = mileage_logs.vehicle_id
              AND (v.org_id IS NULL OR public.user_belongs_to_org(auth.uid(), v.org_id))
          )
        );
    $sql$;
    EXECUTE 'GRANT SELECT, INSERT ON public.mileage_logs TO authenticated';
  END IF;
END $$;

-- ── user_feature_overrides: same-org staff via can_org_admin_write ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_feature_overrides'
  ) THEN
    DROP POLICY IF EXISTS "user_feature_overrides_same_org_staff" ON public.user_feature_overrides;
    CREATE POLICY "user_feature_overrides_same_org_staff"
      ON public.user_feature_overrides
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles target
          WHERE target.id = user_feature_overrides.user_id
            AND target.org_id IS NOT NULL
            AND public.user_belongs_to_org(auth.uid(), target.org_id)
            AND public.can_org_admin_write(auth.uid(), target.org_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles target
          WHERE target.id = user_feature_overrides.user_id
            AND target.org_id IS NOT NULL
            AND public.user_belongs_to_org(auth.uid(), target.org_id)
            AND public.can_org_admin_write(auth.uid(), target.org_id)
        )
      );
  END IF;
END $$;

-- ── Anon: remove table/sequence privileges (sensitive data via service role / auth only) ─
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- =============================================================================
-- FILE: 20260402140000_service_role_grants_public.sql
-- =============================================================================

-- =============================================================================
-- שחזור הרשאות service_role על public (נדרש לסקריפט npm run sync:data:staging-to-prod
-- ולפונקציות שרת), אם בפרויקט נשארו חסרות הרשאות אחרי שינויים ידניים או העתקת DB.
-- =============================================================================
-- אם ב-PostgREST מקבלים 403 "permission denied for table ..." עם מפתח service_role —
-- הריצו מיגרציה זו על פרויקט היעד (או את אותו GRANT ב-SQL Editor).
-- =============================================================================

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- אחרי ההרצה: ב-Dashboard → Project Settings → API → Reload schema (או המתנה קצרה).
