import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FROM_EMAIL = 'Fleet Manager Pro <no-reply@fleet-manager.pro>';

type Body = {
  to_email?: string;
  doc_url?: string;
  doc_title?: string;
  driver_name?: string;
  vehicle_label?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as Body;
    const to = clean(body.to_email).toLowerCase();
    const docUrl = clean(body.doc_url);
    const docTitle = clean(body.doc_title) || 'מסמך';
    const driverName = clean(body.driver_name);
    const vehicleLabel = clean(body.vehicle_label);

    if (!to || !isValidEmail(to)) return json({ error: 'Missing or invalid to_email' }, 400);
    if (!docUrl || !isValidHttpUrl(docUrl)) return json({ error: 'Missing or invalid doc_url' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) {
      return json({ error: 'Missing server secrets' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // best-effort org name from JWT user (optional)
    let orgName = '';
    try {
      const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')?.trim() ?? '';
      if (jwt) {
        const authed = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey } },
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: u } = await authed.auth.getUser();
        const uid = u?.user?.id ?? '';
        if (uid) {
          const { data: p } = await authed.from('profiles').select('org_id').eq('id', uid).maybeSingle();
          const oid = (p as { org_id?: string } | null)?.org_id ?? '';
          if (oid) {
            const { data: o } = await admin.from('organizations').select('name').eq('id', oid).maybeSingle();
            orgName = (o as { name?: string } | null)?.name?.trim() ?? '';
          }
        }
      }
    } catch {
      // ignore
    }

    const subjectParts = [docTitle];
    if (driverName) subjectParts.push(`— ${driverName}`);
    if (vehicleLabel) subjectParts.push(`— ${vehicleLabel}`);
    if (orgName) subjectParts.push(`(${orgName})`);
    const subject = subjectParts.join(' ');

    const html = `
<div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="margin: 0 0 10px; color: #0f172a;">${docTitle}</h2>
  ${driverName ? `<p style="margin: 0 0 6px;"><strong>עובד:</strong> ${driverName}</p>` : ''}
  ${vehicleLabel ? `<p style="margin: 0 0 10px;"><strong>רכב:</strong> ${vehicleLabel}</p>` : ''}
  <p style="margin: 14px 0 12px;">לצפייה במסמך:</p>
  <p style="margin: 0 0 18px;">
    <a href="${docUrl}" target="_blank" rel="noopener noreferrer" style="color:#0891b2; font-weight: 700;">
      פתיחת המסמך
    </a>
  </p>
  <p style="color:#64748b; font-size: 12px; margin: 0;">נשלח מתוך Fleet Manager Pro</p>
</div>
`.trim();

    const resendPayload = {
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    };

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    const resendBody = await resendResp.text();
    if (!resendResp.ok) {
      console.error('[send-document-link-email] Resend API error', { status: resendResp.status, body: resendBody });
      return json({ error: `Resend API error (${resendResp.status}): ${resendBody}` }, 500);
    }

    let resendResult: { id?: string } = {};
    try {
      resendResult = JSON.parse(resendBody) as { id?: string };
    } catch {
      // ignore
    }

    return json({ success: true, sent_to: to, email_id: resendResult.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-document-link-email] Error', message);
    return json({ error: message }, 500);
  }
});

