-- אחידות מספר רישוי: רק ספרות (מסיר מקפים, רווחים ותווים שאינם ספרות)
UPDATE public.vehicles
SET plate_number = regexp_replace(plate_number, '[^0-9]', '', 'g')
WHERE plate_number IS NOT NULL
  AND plate_number <> regexp_replace(plate_number, '[^0-9]', '', 'g');
