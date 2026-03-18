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
