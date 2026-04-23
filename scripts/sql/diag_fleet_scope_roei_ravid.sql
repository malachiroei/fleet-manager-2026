-- =============================================================================
-- אבחון היקף ארגון: roeima21 / ravid / malachiroei + UUIDים מהאפליקציה
-- הרץ ב-Supabase → SQL Editor (לא דורש שינוי נתונים).
-- =============================================================================

-- UUIDים קבועים בקוד (ברירת מחדל ללא VITE_*)
-- צי ראשי / "ארגון ראשי - טסט": 857f2311-2ec5-41d3-8e32-dacd450a9a77
-- צי רביד:                         2bb0f9c3-b210-4099-b0c5-de92794d5cc9

-- 1) פרופילים לאימיילים הרלוונטיים
SELECT
  p.id,
  p.email,
  p.full_name,
  p.org_id AS profile_org_id,
  p.parent_admin_id,
  p.managed_by_user_id,
  p.status,
  o.name AS org_name_for_profile_org
FROM public.profiles p
LEFT JOIN public.organizations o ON o.id = p.org_id
WHERE lower(trim(p.email)) IN (
  'roeima21@gmail.com',
  'ravidmalachi@gmail.com',
  'malachiroei@gmail.com'
)
ORDER BY p.email;

-- 2) חברות בארגונים (org_members)
SELECT
  om.user_id,
  p.email,
  om.org_id,
  o.name AS org_name,
  om.role
FROM public.org_members om
JOIN public.profiles p ON p.id = om.user_id
LEFT JOIN public.organizations o ON o.id = om.org_id
WHERE lower(trim(p.email)) IN (
  'roeima21@gmail.com',
  'ravidmalachi@gmail.com',
  'malachiroei@gmail.com'
)
ORDER BY p.email, o.name;

-- 3) ספירת נהגים ורכבים לפי org_id (השוואה בין ארגון רועי לצי ראשי)
SELECT
  d.org_id,
  o.name,
  count(*)::int AS drivers_count
FROM public.drivers d
LEFT JOIN public.organizations o ON o.id = d.org_id
GROUP BY d.org_id, o.name
ORDER BY drivers_count DESC;

SELECT
  v.org_id,
  o.name,
  count(*)::int AS vehicles_count
FROM public.vehicles v
LEFT JOIN public.organizations o ON o.id = v.org_id
GROUP BY v.org_id, o.name
ORDER BY vehicles_count DESC;

-- 4) האם יש שורות drivers/vehicles עם org_id NULL או שגוי
SELECT count(*) FILTER (WHERE org_id IS NULL) AS drivers_null_org
FROM public.drivers;
SELECT count(*) FILTER (WHERE org_id IS NULL) AS vehicles_null_org
FROM public.vehicles;
