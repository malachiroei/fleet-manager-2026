-- ────────────────────────────────────────────────────────────────────────────
-- הרץ את כל הקובץ הזה ב: Supabase Dashboard → SQL Editor → New query
-- ────────────────────────────────────────────────────────────────────────────

-- שלב 1: הסר טריגרים ישנים על vehicle_handovers (אם קיימים)
drop trigger if exists on_handover_inserted          on public.vehicle_handovers;
drop trigger if exists on_vehicle_handover_inserted  on public.vehicle_handovers;
drop trigger if exists notify_handover_email         on public.vehicle_handovers;

-- שלב 2: הסר טריגר ישן על driver_documents (אם קיים)
drop trigger if exists on_driver_document_inserted   on public.driver_documents;

-- שלב 3: צור/עדכן את הפונקציה
create or replace function public.notify_send_handover_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- רק שורות שה-title שלהן מתחיל ב-handover_receipt (עוגן ה-Wizard)
  if NEW.title is null or not (NEW.title like 'handover_receipt%') then
    return NEW;
  end if;

  perform
    supabase_functions.http_request(
      'https://nlsdthcbvqgsfnlnbzcy.supabase.co/functions/v1/send-handover-email',
      'POST',
      '{"Content-Type": "application/json"}'::jsonb,
      jsonb_build_object(
        'type',       TG_OP,
        'table',      TG_TABLE_NAME,
        'schema',     TG_TABLE_SCHEMA,
        'record',     row_to_json(NEW),
        'old_record', null
      ),
      '10000'
    );
  return NEW;
end;
$$;

-- שלב 4: צור טריגר על driver_documents בלבד
create trigger on_driver_document_inserted
  after insert on public.driver_documents
  for each row
  execute function public.notify_send_handover_email();

-- אימות — אמור להחזיר שורה אחת: on_driver_document_inserted
select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname = 'on_driver_document_inserted';
