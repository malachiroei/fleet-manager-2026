-- Restore the DEFAULT gen_random_uuid() on drivers.id column.
-- This was lost at some point, causing INSERT without explicit id to fail.
ALTER TABLE public.drivers ALTER COLUMN id SET DEFAULT gen_random_uuid();
