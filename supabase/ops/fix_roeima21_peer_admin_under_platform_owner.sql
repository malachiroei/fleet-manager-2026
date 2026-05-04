-- =============================================================================
-- roeima21: אדמין ארגון נפרד תחת מנהל-העל (כמו רביד) — לא כפוף לרביד.
-- מציב parent/managed_by על פרופיל malachiroei@gmail.com .
-- בדוק SELECT לפני UPDATE; התאם org_id נפרד אם צריך (לא כאן).
-- =============================================================================

SELECT id, email, org_id, parent_admin_id, managed_by_user_id
FROM public.profiles
WHERE lower(trim(email)) IN ('roeima21@gmail.com', 'malachiroei@gmail.com');

UPDATE public.profiles AS p
SET
  parent_admin_id = m.id,
  managed_by_user_id = m.id,
  updated_at = now()
FROM (
  SELECT id FROM public.profiles WHERE lower(trim(email)) = 'malachiroei@gmail.com' LIMIT 1
) AS m
WHERE lower(trim(p.email)) = 'roeima21@gmail.com'
  AND m.id IS NOT NULL;

SELECT id, email, org_id, parent_admin_id, managed_by_user_id
FROM public.profiles
WHERE lower(trim(email)) = 'roeima21@gmail.com';
