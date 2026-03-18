-- Ensure all authenticated users can view drivers list
-- This prevents empty lists when drivers.user_id is NULL or viewer/manager role is missing.

DROP POLICY IF EXISTS "Users can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Authenticated users can view all drivers" ON public.drivers;

CREATE POLICY "Authenticated users can view all drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (true);
