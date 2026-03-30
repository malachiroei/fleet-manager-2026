-- storage.upload(..., { upsert: true }) may UPDATE an existing object; grant it for mileage-reports.

drop policy if exists "mileage_reports_update_authenticated" on storage.objects;

create policy "mileage_reports_update_authenticated"
on storage.objects for update
using (bucket_id = 'mileage-reports' and auth.uid() is not null)
with check (bucket_id = 'mileage-reports' and auth.uid() is not null);
