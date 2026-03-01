
-- Drop restrictive insert policy
DROP POLICY IF EXISTS "Drivers can create handovers" ON public.vehicle_handovers;

-- Allow any authenticated user to create handovers
CREATE POLICY "Authenticated users can create handovers"
ON public.vehicle_handovers
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
