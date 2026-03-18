-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add Database Webhook → send-handover-email Edge Function
-- Fires after every INSERT into driver_documents.
-- The edge function itself filters to only process handover_receipt anchor docs.
-- ──────────────────────────────────────────────────────────────────────────────

-- supabase_functions.http_request is built-in to every Supabase project.
-- It sends an async HTTP request and automatically includes the service-role JWT.

create or replace function public.notify_send_handover_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
      '10000'   -- timeout ms
    );
  return NEW;
end;
$$;

-- Drop existing trigger if it exists (idempotent)
drop trigger if exists on_driver_document_inserted on public.driver_documents;

-- Create the trigger
create trigger on_driver_document_inserted
  after insert on public.driver_documents
  for each row
  execute function public.notify_send_handover_email();
