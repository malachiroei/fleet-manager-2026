-- Add safety officer text field for vehicle and driver records
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS safety_officer text;

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS safety_officer text;
