-- הרחבת RLS לנהגים: חברי ארגון עם profiles.permissions.drivers = true
-- (מעבר ל־can_org_admin_write שמחייב admin/fleet_manager ב־user_roles או manage_team ב־JSON).
-- מדיניות PERMISSIVE — מספיק שאחת מ־drivers_insert_* תתקיים.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'drivers'
  ) THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "drivers_insert_org_member_drivers_perm" ON public.drivers;
  CREATE POLICY "drivers_insert_org_member_drivers_perm"
    ON public.drivers FOR INSERT TO authenticated
    WITH CHECK (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND COALESCE(
        (
          SELECT (p.permissions ->> 'drivers')::boolean
          FROM public.profiles p
          WHERE p.id = auth.uid()
        ),
        false
      )
    );

  DROP POLICY IF EXISTS "drivers_update_org_member_drivers_perm" ON public.drivers;
  CREATE POLICY "drivers_update_org_member_drivers_perm"
    ON public.drivers FOR UPDATE TO authenticated
    USING (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND COALESCE(
        (
          SELECT (p.permissions ->> 'drivers')::boolean
          FROM public.profiles p
          WHERE p.id = auth.uid()
        ),
        false
      )
    )
    WITH CHECK (
      org_id IS NOT NULL
      AND public.user_belongs_to_org(auth.uid(), org_id)
      AND COALESCE(
        (
          SELECT (p.permissions ->> 'drivers')::boolean
          FROM public.profiles p
          WHERE p.id = auth.uid()
        ),
        false
      )
    );
END $$;
