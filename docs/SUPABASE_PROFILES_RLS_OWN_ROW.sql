-- =============================================================================
-- profiles: הרשאות + RLS לשורה של המשתמש המחובר (מזהה לפי id = auth.uid())
-- הרץ ב-Supabase SQL Editor. מתאים לאפליקציה שמסננת profiles עם .eq('id', user.id).
-- =============================================================================
-- אזהרה: מדיניות "כל המשתמשים רואים את כל ה-profiles" או עריכת צוות — דורשות
-- מדיניות נפרדת (למשל admin). כאן רק "שורה משלך".
-- =============================================================================

alter table public.profiles enable row level security;

-- הרשאות ברמת הטבלה (בנוסף ל-RLS). ב-Supabase בדרך כלל כבר קיימות — בטוח לשחזר.
grant select, insert, update, delete on table public.profiles to authenticated;

-- הסרת מדיניות בעלות שם קבוע (הרץ מחדש בלי כפילויות)
drop policy if exists "profiles_authenticated_select_own" on public.profiles;
drop policy if exists "profiles_authenticated_insert_own" on public.profiles;
drop policy if exists "profiles_authenticated_update_own" on public.profiles;
drop policy if exists "profiles_authenticated_delete_own" on public.profiles;

-- SELECT: רק השורה שבה id = משתמש מחובר
create policy "profiles_authenticated_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- INSERT: רק יצירת פרופיל עם id = auth.uid() (סיינאפ)
create policy "profiles_authenticated_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- UPDATE: רק עדכון השורה שלך (כולל heartbeat current_app_version)
create policy "profiles_authenticated_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- DELETE: רק מחיקת השורה שלך (לרוב לא בשימוש באפליקציה)
create policy "profiles_authenticated_delete_own"
  on public.profiles
  for delete
  to authenticated
  using (id = auth.uid());

-- =============================================================================
-- אדמין: צפייה/עריכה בכל ה-profiles (דוגמה — התאם לטבלת user_roles שלך)
-- =============================================================================
-- drop policy if exists "profiles_admin_select_all" on public.profiles;
-- create policy "profiles_admin_select_all"
--   on public.profiles for select to authenticated
--   using (
--     exists (
--       select 1 from public.user_roles ur
--       where ur.user_id = auth.uid() and ur.role = 'admin'
--     )
--   );
--
-- drop policy if exists "profiles_admin_update_all" on public.profiles;
-- create policy "profiles_admin_update_all"
--   on public.profiles for update to authenticated
--   using (
--     exists (
--       select 1 from public.user_roles ur
--       where ur.user_id = auth.uid() and ur.role = 'admin'
--     )
--   )
--   with check (true);
