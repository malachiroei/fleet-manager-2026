-- =============================================================================
-- שחזור הרשאות service_role על public (נדרש לסקריפט npm run sync:data:staging-to-prod
-- ולפונקציות שרת), אם בפרויקט נשארו חסרות הרשאות אחרי שינויים ידניים או העתקת DB.
-- =============================================================================
-- אם ב-PostgREST מקבלים 403 "permission denied for table ..." עם מפתח service_role —
-- הריצו מיגרציה זו על פרויקט היעד (או את אותו GRANT ב-SQL Editor).
-- =============================================================================

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- אחרי ההרצה: ב-Dashboard → Project Settings → API → Reload schema (או המתנה קצרה).
