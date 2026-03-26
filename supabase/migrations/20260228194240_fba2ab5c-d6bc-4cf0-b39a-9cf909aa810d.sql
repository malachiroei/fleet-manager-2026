-- Allow authenticated users to upload pricing data (delete + insert workflow)
-- Keep existing manager policy; add explicit permissive policies for authenticated import actions.

DROP POLICY IF EXISTS "Authenticated users can insert pricing data" ON public.pricing_data;
DROP POLICY IF EXISTS "Authenticated users can delete pricing data" ON public.pricing_data;

CREATE POLICY "Authenticated users can insert pricing data"
  ON public.pricing_data
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete pricing data"
  ON public.pricing_data
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);