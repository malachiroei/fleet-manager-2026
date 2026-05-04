# היררכיית צוות, ארגונים ונתוני צי — יישור קו

## המודל הנוכחי (מנהל פלטפורמה + אדמינים מוזמנים)

1. **`malachiroei@gmail.com` (מנהל־על)**  
   - לו **ארגון / צי משלו** — `profiles.org_id` + רכבים ונהגים שמסומנים כמנוהלים על ידו (`managed_by_user_id` = `profiles.id` שלו), או ללא מנהל ייעודי אחרי יישור נתונים.  
   - יכול לשלוח **הזמנות**; מי שמצטרף כאדמין מקבל **ארגון/סקופ משלו** ומקים **רק** את הנהגים והרכבים של החברה שלו.  
   - **רואה** את הכל (כולל נתוני אדמינים שיצר) — לפי RLS + חשבון על.

2. **אדמיני צי מוזמנים** (לדוגמה `ravidmalachi@gmail.com`, `roeima21@gmail.com`)  
   - כל אחד **אדמין נפרד** תחת מנהל־העל: `parent_admin_id` / `managed_by` → `malachiroei` (לא אחד לשני).  
   - **רכבים/נהגים שלהם** — `org_id` + `managed_by` של **האדמין הזה** (או ארגון ייעודי אם הופרד).  
   - **רואים** רק מה ששייך **לארגון/למנהל שלהם** (לפי RLS + `org_id` + היררכיה).

3. **משנים תחת אדמין** (למשל `arikzohargold@gmail.com`, `malachiroei1@gmail.com` תחת רביד)  
   - `parent_admin_id` ו־`managed_by_user_id` = **רביד** (`profiles.id`).  
   - אותו `org_id` כמו צי רביד כשאין הפרדה נוספת.

## למה הופיעו כפילויות / חוסרים אחרי SQL גורף

- `UPDATE … SET org_id = …` **בלי `WHERE`** על כל הטבלאות ממזג את כל הציים לארגון אחד — כולם רואים הכל או כולם אפסים במתג שגוי.  
- **תיקון:** יישור מחדש לפי `managed_by_user_id` + החזרת שורות «של מנהל־העל» לארגון הפרופיל שלו.

## מה לא לעשות

- לא `UPDATE` גורף בלי `WHERE`.  
- תמיד: `SELECT` לפני / אחרי, גיבוי.

## סקריפטים ב־`supabase/ops/`

| קובץ | תיאור |
|------|--------|
| `diagnose_malachiroei_fleet_visibility.sql` | אבחון ספירות malachiroei מול גלובלי |
| `reparent_arik_roei1_to_ravid.sql` | קישור אריק + רועי 1 לרביד + יישור `org_id` |
| `fix_roeima21_peer_admin_under_platform_owner.sql` | הורה של roeima21 → malachiroei |
| `reclaim_platform_fleet_from_ravid_org.sql` | **החזרת** רכבים/נהגים מ־org רביד ל־malachiroei, למעט מה שמסומן לרביד/roeima21 |
| `set_null_managed_by_drivers_to_ravid.sql` | נהגים ב־org רביד בלי `managed_by` — שיוך לרביד |
| `diagnose_unassigned_fleet_platform_owner.sql` | איתור רכבים/נהגים בלי `org` / בלי `managed_by` לשיוך ל־malachiroei |
| מיגרציה `20260506140000_*.sql` | אם 20260505120000 נכשל (חסר `user_may_cross_org_fleet_read`) או נוספו פוליסיות SQL ידנית — תיקון + הסרת כפילויות |
| `setup_team_hierarchy_malachiroei_ravid_roeima21.sql` | סדר יישור: מנהל על → שני אדמינים → משנים תחת רביד |

הרץ `reclaim_platform_fleet_from_ravid_org.sql` אחרי שבדקת את בלוקי ה־`SELECT` הראשונים.
