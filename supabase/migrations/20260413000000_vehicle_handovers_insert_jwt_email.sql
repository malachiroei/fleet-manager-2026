-- =============================================================================
-- INSERT עדיין נחסם למרות מדיניות bootstrap: לפעמים auth.users/profiles לא תואמים
-- ל-JWT (סנכרון / שורת פרופיל). מדיניות נוספת: אימות מייל ישירות מ-auth.jwt().
-- =============================================================================

DROP POLICY IF EXISTS "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers;

CREATE POLICY "vehicle_handovers_insert_jwt_bootstrap_email"
  ON public.vehicle_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.vehicle_exists_by_id(vehicle_id)
    AND (
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com'
      )
      OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com'
      )
    )
  );

COMMENT ON POLICY "vehicle_handovers_insert_jwt_bootstrap_email" ON public.vehicle_handovers IS
  'Bootstrap owners: INSERT allowed when JWT email matches (fallback if profiles/auth.users out of sync).';

NOTIFY pgrst, 'reload schema';
