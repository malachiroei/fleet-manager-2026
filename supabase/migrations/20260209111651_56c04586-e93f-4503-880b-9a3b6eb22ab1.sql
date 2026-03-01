
-- Make handover-photos bucket public
UPDATE storage.buckets SET public = true WHERE id = 'handover-photos';

-- Drop conflicting policy and recreate
DROP POLICY IF EXISTS "Authenticated users can view handover photos" ON storage.objects;

-- Ensure upload policy exists (may have been created)
DROP POLICY IF EXISTS "Authenticated users can upload handover photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload handover photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'handover-photos');

CREATE POLICY "Anyone can view handover photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'handover-photos');

-- Driver-vehicle assignment log table
CREATE TABLE IF NOT EXISTS public.driver_vehicle_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMP WITH TIME ZONE,
  assigned_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view assignments"
ON public.driver_vehicle_assignments FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage assignments"
ON public.driver_vehicle_assignments FOR ALL
TO authenticated
USING (is_manager(auth.uid()));
