-- Personal UI denies apply in the app only after fleet-pro-acknowledged-version >= this anchor (manifest version at save time).
alter table public.profiles
  add column if not exists ui_denied_features_anchor_version text null;

comment on column public.profiles.ui_denied_features_anchor_version is
  'Normalized global manifest version when Admin saved permissions modal; denied_features/!TOKEN deferred until user ack >= this (2.7.45+).';
