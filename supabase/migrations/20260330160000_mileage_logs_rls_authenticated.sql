-- Allow authenticated users to insert mileage reports and read back the inserted row (.select after insert).
-- Aligns with ReportMileagePage: user_id = auth.uid(), vehicle_id references vehicles in the user's org
-- (or legacy vehicles with org_id IS NULL).

alter table public.mileage_logs enable row level security;

drop policy if exists "mileage_logs_insert_authenticated" on public.mileage_logs;
drop policy if exists "mileage_logs_select_authenticated" on public.mileage_logs;

create policy "mileage_logs_insert_authenticated"
  on public.mileage_logs
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and (
          (
            v.org_id is not null
            and exists (
              select 1
              from public.org_members om
              where om.org_id = v.org_id
                and om.user_id = auth.uid()
            )
          )
          or v.org_id is null
        )
    )
  );

create policy "mileage_logs_select_authenticated"
  on public.mileage_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and (
          (
            v.org_id is not null
            and exists (
              select 1
              from public.org_members om
              where om.org_id = v.org_id
                and om.user_id = auth.uid()
            )
          )
          or v.org_id is null
        )
    )
  );

grant select, insert on public.mileage_logs to authenticated;
