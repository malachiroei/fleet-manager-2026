-- Make driver_documents trigger resilient when supabase_functions schema is unavailable
-- and point webhook URL to the active Supabase project.

create or replace function public.notify_send_handover_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_http_request boolean;
begin
  has_http_request := to_regprocedure('supabase_functions.http_request(text,text,jsonb,jsonb,text)') is not null;

  if has_http_request then
    perform
      supabase_functions.http_request(
        'https://cesstoohvlbvyreznwqd.supabase.co/functions/v1/send-handover-email',
        'POST',
        '{"Content-Type": "application/json"}'::jsonb,
        jsonb_build_object(
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA,
          'record', row_to_json(NEW),
          'old_record', null
        ),
        '10000'
      );
  end if;

  return NEW;
exception
  when others then
    -- Never block INSERT into driver_documents due to webhook plumbing.
    raise notice 'notify_send_handover_email skipped: %', SQLERRM;
    return NEW;
end;
$$;
