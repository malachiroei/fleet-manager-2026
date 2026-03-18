-- Add INSERT policy for authenticated users on drivers table
CREATE POLICY "Authenticated users can create drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Add INSERT policy for authenticated users on vehicles table
CREATE POLICY "Authenticated users can create vehicles"
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);