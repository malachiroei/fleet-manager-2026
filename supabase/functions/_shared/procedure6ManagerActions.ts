/** Manager quick-action links for Procedure 6 staff emails. */
import {
  buildProcedure6RespondUrl,
  resolveProcedure6PublicAppBaseUrl,
} from './procedure6PublicUrl.ts';

export function buildProcedure6AdminActionUrl(
  responseToken: string,
  opts?: { action?: 'clarify' | 'close' },
): string {
  const token = String(responseToken ?? '').trim();
  const base = resolveProcedure6PublicAppBaseUrl();
  if (!token) return `${base}/procedure6/admin-action/`;
  const path = `${base}/procedure6/admin-action/${encodeURIComponent(token)}`;
  if (opts?.action === 'clarify') return `${path}?action=clarify`;
  if (opts?.action === 'close') return `${path}?action=close`;
  return path;
}

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Two CTA buttons: close complaint / ask driver for clarification. */
export function procedure6ManagerActionButtonsHtml(responseToken: string): string {
  const token = String(responseToken ?? '').trim();
  if (!token) return '';
  const closeUrl = escHtml(buildProcedure6AdminActionUrl(token, { action: 'close' }));
  const clarifyUrl = escHtml(buildProcedure6AdminActionUrl(token, { action: 'clarify' }));
  return `
  <div style="margin:22px 0 8px;text-align:center;">
    <a href="${closeUrl}"
       style="display:inline-block;background:#059669;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin:4px 6px;">
      סגירת התלונה
    </a>
    <a href="${clarifyUrl}"
       style="display:inline-block;background:#0369a1;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin:4px 6px;">
      החזרת שאלה / הבהרה לנהג
    </a>
  </div>
  <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-align:center;">
    או פתחו את דף הטיפול: ${escHtml(buildProcedure6AdminActionUrl(token))}
  </p>`;
}

export { buildProcedure6RespondUrl };
