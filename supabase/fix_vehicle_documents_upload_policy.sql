-- Fix: allow any authenticated user to upload to vehicle-documents bucket.
-- The old manager-only INSERT policy causes 403 for non-manager users (e.g. during wizard).
-- Run this in the Supabase Dashboard → SQL Editor.

-- Drop both the old restrictive policy AND the previously attempted fix (in case either exists)
DROP POLICY IF EXISTS "Managers can upload vehicle documents"                        ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload vehicle documents storage"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view vehicle documents storage"       ON storage.objects;
DROP POLICY IF EXISTS "Managers can view vehicle documents"                          ON storage.objects;

-- Allow any authenticated user to READ objects in vehicle-documents
CREATE POLICY "vehicle_documents_select_authenticated"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

-- Allow any authenticated user to UPLOAD to vehicle-documents
CREATE POLICY "vehicle_documents_insert_authenticated"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

-- Keep the bucket itself public (so the edge function can fetch URLs without auth)
UPDATE storage.buckets
SET public = true
WHERE id = 'vehicle-documents';
