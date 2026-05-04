-- =============================================================================
-- איחוד: נהגים בצי רביד (2bb0f9c3-…) עם managed_by_user_id ריק — לשייך לרביד.
-- הרץ אחרי גיבוי. אימות SELECT לפני ואחרי.
-- =============================================================================

SELECT id, full_name, email, org_id, managed_by_user_id
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id IS NULL;

UPDATE public.drivers d
SET
  managed_by_user_id = (
    SELECT p.id FROM public.profiles p WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com' LIMIT 1
  ),
  updated_at = now()
WHERE d.org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND d.managed_by_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com'
  );

SELECT id, full_name, email, org_id, managed_by_user_id
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
ORDER BY full_name;
