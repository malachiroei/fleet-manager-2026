/**
 * @deprecated הלקוח שולח דרך `send-service-update-notification` עם `notificationType: "fleet_field"`.
 * נשמר לפריסות קיימות; אין צורך לפרוס פונקציה זו לפרויקט חדש.
 * Secrets: RESEND_API_KEY; אופציונלי: NOTIFY_FROM_EMAIL
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, accept-profile, content-profile, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export interface FleetFieldUpdateRow {
  label: string;
  value: string;
}

export interface FleetFieldUpdateBody {
  to?: string;
  subject: string;
  headline?: string;
  plateNumber?: string;
  vehicleLabel?: string;
  rows: FleetFieldUpdateRow[];
  documentUrl?: string | null;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail =
      Deno.env.get('NOTIFY_FROM_EMAIL') || 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as FleetFieldUpdateBody;
    const subject = (body.subject?.trim() || 'עדכון במערכת').slice(0, 200);
    const to =
      (body.to && String(body.to).includes('@') ? String(body.to).trim() : '') ||
      'malachiroei@gmail.com';

    const headline = esc(body.headline?.trim() || subject);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const safeDoc = String(body.documentUrl ?? '').trim().replace(/"/g, '');

    let tableRows = '';
    for (const r of rows) {
      const lab = esc(String(r.label ?? ''));
      const val = esc(String(r.value ?? ''));
      tableRows += `<tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;">${lab}</td><td style="padding:6px 0;">${val}</td></tr>`;
    }

    const plateBlock =
      body.plateNumber || body.vehicleLabel
        ? `<p style="margin:12px 0;"><strong dir="ltr">${esc(body.plateNumber ?? '')}</strong>
           ${body.vehicleLabel ? `<span> · ${esc(body.vehicleLabel)}</span>` : ''}</p>`
        : '';

    const docBlock = safeDoc
      ? `<p style="margin-top:14px;"><strong>מסמך / צילום:</strong><br/>
         <a href="${safeDoc}" target="_blank" rel="noopener noreferrer">פתיחת קישור</a></p>`
      : '';

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2 style="margin-bottom:8px;">${headline}</h2>
        ${plateBlock}
        <table style="border-collapse:collapse;width:100%;max-width:520px;">${tableRows}</table>
        ${docBlock}
        <p style="font-size:12px;color:#6b7280;margin-top:20px;">נשלח אוטומטית ממערכת Fleet Manager Pro.</p>
      </div>
    `.trim();

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      console.error('Resend Error:', errText);
      return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resendResp.json();
    return new Response(JSON.stringify({ success: true, result: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-fleet-field-update-notification error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
