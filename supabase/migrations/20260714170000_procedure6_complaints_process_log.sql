-- Chronological handling log for Procedure 6 (clarifications, responses, closure)
ALTER TABLE public.procedure6_complaints
  ADD COLUMN IF NOT EXISTS process_log text;

COMMENT ON COLUMN public.procedure6_complaints.process_log IS
  'Append-only Hebrew timeline of handling steps (clarification requests, driver replies, closure)';

NOTIFY pgrst, 'reload schema';
