-- ─── Driver extra fields ────────────────────────────────────────────────────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS family_permit_date date,
  ADD COLUMN IF NOT EXISTS driving_permit text,
  ADD COLUMN IF NOT EXISTS is_field_person boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS practical_driving_test_date date;

-- ─── Driver Family Members ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_family_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  relationship    text NOT NULL,          -- spouse / child / parent / sibling / other
  phone           text,
  id_number       text,
  birth_date      date,
  address         text,
  city            text,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE driver_family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage family members"
  ON driver_family_members FOR ALL
  USING (auth.role() = 'authenticated');

-- ─── Driver Incidents (events & accidents) ──────────────────────────────────
-- Accidents are driver-linked; optional vehicle_id enables cross-display on vehicle card
CREATE TABLE IF NOT EXISTS driver_incidents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id          uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  incident_type       text NOT NULL CHECK (incident_type IN ('event', 'accident')),
  incident_date       date NOT NULL,
  description         text NOT NULL,
  location            text,
  damage_desc         text,
  police_report_no    text,
  insurance_claim     text,
  photo_urls          text[],
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE driver_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage driver incidents"
  ON driver_incidents FOR ALL
  USING (auth.role() = 'authenticated');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS driver_incidents_driver_id_idx ON driver_incidents (driver_id);
CREATE INDEX IF NOT EXISTS driver_incidents_vehicle_id_idx ON driver_incidents (vehicle_id);
CREATE INDEX IF NOT EXISTS driver_family_members_driver_id_idx ON driver_family_members (driver_id);
