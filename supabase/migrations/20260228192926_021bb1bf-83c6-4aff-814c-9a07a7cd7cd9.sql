
-- Fix drivers table RLS: change RESTRICTIVE to PERMISSIVE

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can create drivers" ON public.drivers;
DROP POLICY IF EXISTS "Managers can manage all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Users can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view own record" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own record" ON public.drivers;

-- Recreate as PERMISSIVE
CREATE POLICY "Authenticated users can create drivers"
  ON public.drivers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Managers can manage all drivers"
  ON public.drivers FOR ALL
  TO authenticated
  USING (is_manager(auth.uid()))
  WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "Users can view all drivers"
  ON public.drivers FOR SELECT
  TO authenticated
  USING (is_manager(auth.uid()) OR has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "Drivers can view own record"
  ON public.drivers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Drivers can update own record"
  ON public.drivers FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
