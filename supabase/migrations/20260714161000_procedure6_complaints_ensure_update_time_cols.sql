-- Ensure timestamp columns exist (older prod schemas may lack them)
ALTER TABLE public.procedure6_complaints
  ADD COLUMN IF NOT EXISTS first_update_time timestamptz,
  ADD COLUMN IF NOT EXISTS last_update_time timestamptz;

NOTIFY pgrst, 'reload schema';
