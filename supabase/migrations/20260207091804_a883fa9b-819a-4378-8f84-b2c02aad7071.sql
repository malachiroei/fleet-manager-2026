-- Drop existing restrictive INSERT policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Authenticated users can create vehicles" ON public.vehicles;

-- Create PERMISSIVE INSERT policies for drivers
CREATE POLICY "Authenticated users can insert drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create PERMISSIVE INSERT policies for vehicles
CREATE POLICY "Authenticated users can insert vehicles"
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add PERMISSIVE UPDATE policy for managers to update any driver
DROP POLICY IF EXISTS "Managers can manage drivers" ON public.drivers;
CREATE POLICY "Managers can manage all drivers"
ON public.drivers
FOR ALL
TO authenticated
USING (is_manager(auth.uid()));

-- Add PERMISSIVE UPDATE policy for managers to update any vehicle (including assigning drivers)
DROP POLICY IF EXISTS "Managers can manage vehicles" ON public.vehicles;
CREATE POLICY "Managers can manage all vehicles"
ON public.vehicles
FOR ALL
TO authenticated
USING (is_manager(auth.uid()));

-- Ensure authenticated users can update vehicles they're assigned to (for odometer updates etc.)
CREATE POLICY "Assigned drivers can update vehicle odometer"
ON public.vehicles
FOR UPDATE
TO authenticated
USING (
  assigned_driver_id IN (
    SELECT id FROM public.drivers WHERE user_id = auth.uid()
  )
);