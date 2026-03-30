-- Allow any authenticated user to READ/UPLOAD mileage report photos.
-- (Matches the pattern used for 'vehicle-documents' bucket policies.)

-- Ensure bucket exists (non-destructive if it already exists).
insert into storage.buckets (id, name, public)
values ('mileage-reports', 'mileage-reports', true)
on conflict (id) do nothing;

-- Storage RLS policies for the 'mileage-reports' bucket
drop policy if exists "mileage_reports_select_authenticated" on storage.objects;
drop policy if exists "mileage_reports_insert_authenticated" on storage.objects;

create policy "mileage_reports_select_authenticated"
on storage.objects for select
using (bucket_id = 'mileage-reports' and auth.uid() is not null);

create policy "mileage_reports_insert_authenticated"
on storage.objects for insert
with check (bucket_id = 'mileage-reports' and auth.uid() is not null);

