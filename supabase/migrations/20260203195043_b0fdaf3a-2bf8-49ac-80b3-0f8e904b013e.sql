-- Fix function search_path warnings
CREATE OR REPLACE FUNCTION public.calculate_compliance_status(expiry_date DATE)
RETURNS compliance_status
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    IF expiry_date < CURRENT_DATE THEN
        RETURN 'expired';
    ELSIF expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN
        RETURN 'warning';
    ELSE
        RETURN 'valid';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Create private storage buckets for documents
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('vehicle-documents', 'vehicle-documents', false),
    ('driver-documents', 'driver-documents', false),
    ('maintenance-documents', 'maintenance-documents', false),
    ('handover-photos', 'handover-photos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for vehicle-documents bucket
CREATE POLICY "Managers can view vehicle documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can upload vehicle documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can update vehicle documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete vehicle documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-documents' AND public.is_manager(auth.uid()));

-- RLS Policies for driver-documents bucket (more restricted)
CREATE POLICY "Managers can view driver documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can upload driver documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can update driver documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete driver documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'driver-documents' AND public.is_manager(auth.uid()));

-- RLS Policies for maintenance-documents bucket
CREATE POLICY "Authenticated users can view maintenance docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'maintenance-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers can upload maintenance docs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'maintenance-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can update maintenance docs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'maintenance-documents' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete maintenance docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'maintenance-documents' AND public.is_manager(auth.uid()));

-- RLS Policies for handover-photos bucket
CREATE POLICY "Authenticated users can view handover photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'handover-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers and drivers can upload handover photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'handover-photos' AND (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), 'driver')));

CREATE POLICY "Managers can update handover photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'handover-photos' AND public.is_manager(auth.uid()));

CREATE POLICY "Managers can delete handover photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'handover-photos' AND public.is_manager(auth.uid()));