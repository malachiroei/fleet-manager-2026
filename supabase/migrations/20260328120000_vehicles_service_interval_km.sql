-- Manufacturer-recommended service interval (e.g. 15000 km)
alter table public.vehicles
  add column if not exists service_interval_km integer null;

comment on column public.vehicles.service_interval_km is
  'Recommended interval between services in km (manufacturer guideline, e.g. 15000).';
