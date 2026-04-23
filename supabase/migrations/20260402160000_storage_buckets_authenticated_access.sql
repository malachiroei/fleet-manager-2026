-- =============================================================================
-- Align Production storage with Staging: core fleet buckets readable/writable
-- by authenticated users (fixes 403 on images / mileage photo flow when policies
-- were missing or reverted).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('vehicle-documents', 'vehicle-documents', true),
  ('mileage-reports', 'mileage-reports', true),
  ('handover-photos', 'handover-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- vehicle-documents
DROP POLICY IF EXISTS "Managers can upload vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vehicle documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view vehicle documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Managers can view vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_documents_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_documents_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_documents_update_authenticated" ON storage.objects;

CREATE POLICY "vehicle_documents_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-documents');

CREATE POLICY "vehicle_documents_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-documents');

CREATE POLICY "vehicle_documents_update_authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

-- mileage-reports
DROP POLICY IF EXISTS "mileage_reports_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "mileage_reports_select_public_bucket" ON storage.objects;
DROP POLICY IF EXISTS "mileage_reports_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "mileage_reports_update_authenticated" ON storage.objects;

CREATE POLICY "mileage_reports_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mileage-reports');

CREATE POLICY "mileage_reports_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mileage-reports');

CREATE POLICY "mileage_reports_update_authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'mileage-reports' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'mileage-reports' AND auth.uid() IS NOT NULL);

-- handover-photos (bucket often public; keep authenticated upload)
DROP POLICY IF EXISTS "Authenticated users can view handover photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view handover photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload handover photos" ON storage.objects;
DROP POLICY IF EXISTS "Managers and drivers can upload handover photos" ON storage.objects;

CREATE POLICY "handover_photos_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'handover-photos');

CREATE POLICY "handover_photos_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'handover-photos');
