import { getSupabaseUrl } from '@/integrations/supabase/publicEnv';

/** URL מוחלט לאותו קובץ לוגו כמו במיילי Edge (bucket public). */
export function getEmailFleetBrandLogoAbsoluteUrl(): string | null {
  const base = String(getSupabaseUrl() ?? '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/storage/v1/object/public/logos/logo.jpg`;
}

/** בלוק תמונה זהה לסגנון מייל הבדיקה (גובה ~44px). */
export function emailFleetBrandHeaderHtmlFromClient(): string {
  const logo = getEmailFleetBrandLogoAbsoluteUrl();
  if (!logo) return '';
  return `<div style="margin:0 0 16px;text-align:right;direction:rtl;">
  <img src="${logo}" alt="Fleet Manager Pro" style="height:44px;width:auto;max-width:min(100%,240px);display:inline-block;" />
</div>`;
}
