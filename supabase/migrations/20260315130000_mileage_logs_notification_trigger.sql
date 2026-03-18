-- Trigger function: on new mileage_logs row, call send-mileage-notification edge function

create or replace function public.handle_new_mileage_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _payload jsonb;
  _edge_response jsonb;
begin
  _payload := jsonb_build_object(
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', null
  );

  perform
    http((
      'POST',
      current_setting('app.settings.supabase_url', true) || '/functions/v1/send-mileage-notification',
      array[
        ('Content-Type', 'application/json')::http_header,
        ('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true))::http_header
      ],
      'application/json',
      _payload
    ));

  return NEW;
end;
$$;

drop trigger if exists trg_mileage_logs_notify on public.mileage_logs;

create trigger trg_mileage_logs_notify
after insert on public.mileage_logs
for each row
execute function public.handle_new_mileage_log();

