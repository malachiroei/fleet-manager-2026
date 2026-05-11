import { supabasePublicObjectUrl } from './supabasePublicUrl.ts';

/** כותרת ויזואלית אחידה לכל מיילי Fleet (אותו לוגו כמו בדיקת שליחה). */
export function emailFleetBrandHeaderHtml(supabaseUrl: string): string {
  const logoUrl = supabasePublicObjectUrl(supabaseUrl, 'logos/logo.jpg');
  return `<div style="margin:0 0 16px;text-align:right;direction:rtl;">
  <img src="${logoUrl}" alt="Fleet Manager Pro" style="height:44px;width:auto;max-width:min(100%,240px);display:inline-block;" />
</div>`;
}

/** לעטוף גוף HTML קיים (מחרוזת פנימית בלבד). */
export function wrapEmailBodyWithBrand(supabaseUrl: string, innerHtml: string): string {
  return `${emailFleetBrandHeaderHtml(supabaseUrl)}\n${innerHtml}`;
}
