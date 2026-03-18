-- RLS: allow any authenticated user to UPDATE drivers (same openness as SELECT on drivers).
-- Without this, only is_manager() or drivers.user_id = auth.uid() could update — others got 0 rows back.
-- PERMISSIVE is default; this policy adds to existing manager/own-row policies.

DROP POLICY IF EXISTS "Authenticated users can update drivers" ON public.drivers;

CREATE POLICY "Authenticated users can update drivers"
ON public.drivers
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
