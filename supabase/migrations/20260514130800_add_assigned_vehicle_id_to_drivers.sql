ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
