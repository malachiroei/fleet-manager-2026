-- Migration: Fix vehicle-documents upload policy to allow all authenticated users.
-- Previously only is_manager() could upload, causing 403 during the wizard for regular users.

DROP POLICY IF EXISTS "Managers can upload vehicle documents"                    ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vehicle documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view vehicle documents storage"   ON storage.objects;
DROP POLICY IF EXISTS "Managers can view vehicle documents"                      ON storage.objects;
DROP POLICY IF EXISTS "vehicle_documents_select_authenticated"                   ON storage.objects;
DROP POLICY IF EXISTS "vehicle_documents_insert_authenticated"                   ON storage.objects;

CREATE POLICY "vehicle_documents_select_authenticated"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "vehicle_documents_insert_authenticated"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

UPDATE storage.buckets
SET public = true
WHERE id = 'vehicle-documents';
