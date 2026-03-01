-- Drop ALL existing policies on drivers table to start fresh
DROP POLICY IF EXISTS "Authenticated users can insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own non-sensitive fields" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view own record" ON public.drivers;
DROP POLICY IF EXISTS "Managers can manage all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers can manage drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers can view all drivers" ON public.drivers;

-- Create new PERMISSIVE policies for drivers

-- Allow any authenticated user to INSERT new drivers
CREATE POLICY "Authenticated users can create drivers"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Managers can do anything (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Managers can manage all drivers"
ON public.drivers
FOR ALL
TO authenticated
USING (is_manager(auth.uid()));

-- Viewers and managers can view all drivers
CREATE POLICY "Users can view all drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (is_manager(auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));

-- Drivers can view their own record
CREATE POLICY "Drivers can view own record"
ON public.drivers
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Drivers can update their own record (non-sensitive fields)
CREATE POLICY "Drivers can update own record"
ON public.drivers
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());