-- Feature flag: עדכון טיפול (service update form + quick links)
insert into public.feature_flags (feature_key, display_name_he, description, category, is_enabled_globally)
values (
  'qa_service_update',
  'עדכון טיפול',
  'רישום טיפול, חישוב טיפול הבא ומסך עדכון טיפול ברשימת רכבים',
  'quick_actions',
  true
)
on conflict (feature_key) do nothing;
