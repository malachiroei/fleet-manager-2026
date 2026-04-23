-- Bucket is public; browser <img src={getPublicUrl(...)}> does not send Supabase JWT.
-- Previous policy required auth.uid() for SELECT, which blocked anonymous GET of public URLs.

drop policy if exists "mileage_reports_select_authenticated" on storage.objects;

create policy "mileage_reports_select_public_bucket"
on storage.objects
for select
using (bucket_id = 'mileage-reports');
