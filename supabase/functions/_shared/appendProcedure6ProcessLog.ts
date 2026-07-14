import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

function stampHe(): string {
  return new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

/** Append one line to procedure6_complaints.process_log (best-effort). */
export async function appendProcedure6ProcessLog(
  admin: SupabaseClient,
  opts: {
    id: string;
    response_token?: string | null;
    org_id?: string | null;
    line: string;
  },
): Promise<void> {
  const id = String(opts.id ?? '').trim();
  const line = String(opts.line ?? '').trim();
  if (!id || !line) return;

  try {
    let q = admin.from('procedure6_complaints').select('process_log').eq('id', id);
    const token = String(opts.response_token ?? '').trim();
    if (token) q = q.eq('response_token', token);
    const oid = String(opts.org_id ?? '').trim();
    if (oid) q = q.eq('org_id', oid);

    const { data: row } = await q.maybeSingle();
    const prev = typeof row?.process_log === 'string' ? row.process_log.trim() : '';
    const entry = `[${stampHe()}] ${line}`;
    const next = prev ? `${prev}\n${entry}` : entry;

    let u = admin.from('procedure6_complaints').update({ process_log: next }).eq('id', id);
    if (token) u = u.eq('response_token', token);
    if (oid) u = u.eq('org_id', oid);
    const { error } = await u;
    if (error) console.warn('[appendProcedure6ProcessLog]', error.message);
  } catch (err) {
    console.warn('[appendProcedure6ProcessLog]', err);
  }
}
