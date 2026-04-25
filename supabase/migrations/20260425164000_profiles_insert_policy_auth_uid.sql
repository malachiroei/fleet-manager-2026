DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'profiles'
      AND c.column_name = 'user_id'
  ) THEN
    EXECUTE $ins$
      CREATE POLICY "Users can insert their own profile"
        ON public.profiles FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = id OR auth.uid() = user_id)
    $ins$;
  ELSE
    EXECUTE $ins$
      CREATE POLICY "Users can insert their own profile"
        ON public.profiles FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = id)
    $ins$;
  END IF;
END $$;

COMMENT ON POLICY "Users can insert their own profile" ON public.profiles IS
  'Insert own row: id = auth.uid() (or legacy user_id = auth.uid()).';

NOTIFY pgrst, 'reload schema';
