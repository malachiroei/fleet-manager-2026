-- =============================================================================
-- org_documents — אבחון למה טפסים לא מופיעים ב־/forms + הפעלה מחדש של שורות כבויות
-- =============================================================================
--
-- הקשר:
-- · האפליקציה (`useOrgDocuments`) טוענת רק שורות עם is_active = true.
-- · טבלאות גיבוי כמו org_documents_backup_march17 / org_documents_old לא נקראות
--   באופן אוטומטי — הן רק גיבוי ידני ב-Supabase.
-- · file_url יכול להיות NULL לטפסים שנוצרו כטקסט/תבנית בלי PDF — עדיין אמורים להופיע ברשימה.
-- · דלי Storage (driver-documents וכו') לא מחליף את org_documents: הקישור נשמר בעמודה file_url.
--
-- הרץ ב-SQL Editor (קריאה בלבד):
-- =============================================================================

SELECT is_active, count(*) AS n
FROM public.org_documents
GROUP BY 1
ORDER BY 1;

SELECT id, title, is_active, updated_at
FROM public.org_documents
WHERE is_active = false
ORDER BY updated_at DESC;

-- =============================================================================
-- תיקון מהיר: להחזיר לתצוגה כל מה שסומן כלא פעיל (כמו אחרי ייבוא או עריכה מקרית)
-- =============================================================================
-- הרץ רק אחרי שבדקת את הרשימה למעלה:
--
-- UPDATE public.org_documents
-- SET is_active = true, updated_at = now()
-- WHERE is_active = false;

-- =============================================================================
-- השוואה לגיבוי (אם קיימת טבלת גיבוי בשם הזה — עדכן שם אם אצלכם שונה)
-- =============================================================================
-- SELECT 'live' AS src, count(*)::bigint FROM public.org_documents
-- UNION ALL
-- SELECT 'backup_march17', count(*)::bigint FROM public.org_documents_backup_march17;

-- שורות שיש בגיבוי ואין בלייב (לפי id):
-- SELECT b.id, b.title
-- FROM public.org_documents_backup_march17 b
-- WHERE NOT EXISTS (SELECT 1 FROM public.org_documents o WHERE o.id = b.id);
