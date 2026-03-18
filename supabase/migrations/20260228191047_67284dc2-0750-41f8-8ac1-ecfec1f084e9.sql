
-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can view pricing data" ON public.pricing_data;
DROP POLICY IF EXISTS "Managers can manage pricing data" ON public.pricing_data;

CREATE POLICY "Authenticated users can view pricing data"
  ON public.pricing_data FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage pricing data"
  ON public.pricing_data FOR ALL
  TO authenticated
  USING (is_manager(auth.uid()))
  WITH CHECK (is_manager(auth.uid()));
