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