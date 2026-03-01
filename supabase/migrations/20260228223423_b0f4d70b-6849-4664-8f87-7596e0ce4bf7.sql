
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
