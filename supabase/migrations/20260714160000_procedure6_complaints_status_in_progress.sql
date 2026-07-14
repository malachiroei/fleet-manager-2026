-- Allow open | in_progress | closed on procedure6_complaints.status
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'procedure6_complaints'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.procedure6_complaints DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.procedure6_complaints
  DROP CONSTRAINT IF EXISTS procedure6_complaints_status_check;

ALTER TABLE public.procedure6_complaints
  ADD CONSTRAINT procedure6_complaints_status_check
  CHECK (status IN ('open', 'in_progress', 'closed'));
