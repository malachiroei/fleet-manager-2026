-- RPC function for bulk upserting drivers without the id=NULL issue
-- PostgREST's client-side upsert sets all columns (including `id`) explicitly,
-- which overrides the DEFAULT gen_random_uuid(). This function avoids that by
-- using proper SQL INSERT ... ON CONFLICT syntax where `id` uses DEFAULT naturally.

CREATE OR REPLACE FUNCTION public.bulk_upsert_drivers(drivers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  inserted_count int := 0;
  updated_count int := 0;
BEGIN
  FOR row_data IN SELECT * FROM jsonb_array_elements(drivers)
  LOOP
    INSERT INTO public.drivers (
      full_name,
      id_number,
      phone,
      email,
      license_expiry,
      safety_training_date,
      department,
      address,
      driver_code,
      is_active,
      employee_number,
      work_start_date,
      city,
      note1,
      note2,
      rating,
      division,
      eligibility,
      area,
      group_name,
      group_code,
      job_title,
      license_number,
      status,
      org_id
    ) VALUES (
      row_data->>'full_name',
      row_data->>'id_number',
      row_data->>'phone',
      row_data->>'email',
      (row_data->>'license_expiry')::date,
      (row_data->>'safety_training_date')::date,
      row_data->>'department',
      row_data->>'address',
      row_data->>'driver_code',
      COALESCE((row_data->>'is_active')::bool, true),
      row_data->>'employee_number',
      (row_data->>'work_start_date')::date,
      row_data->>'city',
      row_data->>'note1',
      row_data->>'note2',
      row_data->>'rating',
      row_data->>'division',
      row_data->>'eligibility',
      row_data->>'area',
      row_data->>'group_name',
      row_data->>'group_code',
      row_data->>'job_title',
      row_data->>'license_number',
      COALESCE(row_data->>'status', 'valid'),
      (row_data->>'org_id')::uuid
    )
    ON CONFLICT (id_number, org_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = COALESCE(EXCLUDED.phone, drivers.phone),
      email = COALESCE(EXCLUDED.email, drivers.email),
      license_expiry = EXCLUDED.license_expiry,
      safety_training_date = COALESCE(EXCLUDED.safety_training_date, drivers.safety_training_date),
      department = COALESCE(EXCLUDED.department, drivers.department),
      address = COALESCE(EXCLUDED.address, drivers.address),
      driver_code = COALESCE(EXCLUDED.driver_code, drivers.driver_code),
      is_active = EXCLUDED.is_active,
      employee_number = COALESCE(EXCLUDED.employee_number, drivers.employee_number),
      work_start_date = COALESCE(EXCLUDED.work_start_date, drivers.work_start_date),
      city = COALESCE(EXCLUDED.city, drivers.city),
      note1 = COALESCE(EXCLUDED.note1, drivers.note1),
      note2 = COALESCE(EXCLUDED.note2, drivers.note2),
      rating = COALESCE(EXCLUDED.rating, drivers.rating),
      division = COALESCE(EXCLUDED.division, drivers.division),
      eligibility = COALESCE(EXCLUDED.eligibility, drivers.eligibility),
      area = COALESCE(EXCLUDED.area, drivers.area),
      group_name = COALESCE(EXCLUDED.group_name, drivers.group_name),
      group_code = COALESCE(EXCLUDED.group_code, drivers.group_code),
      job_title = COALESCE(EXCLUDED.job_title, drivers.job_title),
      license_number = COALESCE(EXCLUDED.license_number, drivers.license_number),
      status = EXCLUDED.status;

    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', inserted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_upsert_drivers(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
