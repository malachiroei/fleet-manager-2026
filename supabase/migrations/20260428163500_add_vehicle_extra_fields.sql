-- Extra vehicle fields requested by operations
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS vehicle_standard text,
ADD COLUMN IF NOT EXISTS vat_recognized boolean;
