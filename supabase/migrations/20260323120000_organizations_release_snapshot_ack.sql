-- גשר סנכרון הגדרות (Git snapshot): גרסת ACK לארגון בפרודקשן
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS release_snapshot_ack_version TEXT NOT NULL DEFAULT '0.0.0';

COMMENT ON COLUMN public.organizations.release_snapshot_ack_version IS
  'גרסת release_snapshot.json שסונכרנה לארגון זה (השוואה מול הקובץ בבנדל).';
