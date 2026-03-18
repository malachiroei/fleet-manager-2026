ALTER TABLE public.vehicle_handovers
ADD COLUMN IF NOT EXISTS pdf_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-documents', 'vehicle-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Managers can view vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update vehicle documents" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete vehicle documents" ON storage.objects;

CREATE POLICY "Authenticated users can view vehicle documents storage"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload vehicle documents storage"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update vehicle documents storage"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete vehicle documents storage"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));
