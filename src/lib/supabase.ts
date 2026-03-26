/**
 * נקודת כניסה ידידותית ל־Supabase מהשורש של `lib`.
 *
 * חשוב: אין כאן (וגם לא ב־`./supabase/client`) דגל שמבטל שליחת מיילים במצב פיתוח.
 * הזמנות נשלחות דרך Edge Function `send-invite` — ראה `sendInvitationEmail`.
 */
export { supabase } from './supabase/client';
