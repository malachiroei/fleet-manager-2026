import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export interface ServiceUpdateNotificationBody {
  subject: string;
  plateNumber: string;
  vehicleLabel: string;
  serviceDate: string;
  nextServiceDate: string;
  currentMileage: number;
  nextServiceKm: number | null;
  serviceIntervalKm: number | null;
  invoicePhotoUrl: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || 'onboarding@resend.dev';

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing RESEND_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as ServiceUpdateNotificationBody;
    const subject = body.subject?.trim() || 'עדכון טיפול';
    const to = 'malachiroei@gmail.com';

    const kmStr = (n: number | null | undefined) =>
      n != null && Number.isFinite(n) ? `${Number(n).toLocaleString('he-IL')} ק"מ` : '—';

    const safePhotoHref = String(body.invoicePhotoUrl ?? '').replace(/"/g, '');

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2>${esc(subject)}</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 480px;">
          <tr><td style="padding: 6px 0; color: #6b7280;">מספר רישוי</td><td style="padding: 6px 0;"><strong dir="ltr">${esc(body.plateNumber || '')}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">רכב</td><td style="padding: 6px 0;">${esc(body.vehicleLabel || '')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">תאריך טיפול</td><td style="padding: 6px 0;">${esc(body.serviceDate || '')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">תאריך טיפול הבא (אוטומטי +שנה)</td><td style="padding: 6px 0;">${esc(body.nextServiceDate || '')}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">קילומטראז׳ בטיפול</td><td style="padding: 6px 0;" dir="ltr">${kmStr(body.currentMileage)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">ק״מ לטיפול הבא (מחושב)</td><td style="padding: 6px 0;" dir="ltr">${kmStr(body.nextServiceKm)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">מרווח טיפול בק״מ (יצרן)</td><td style="padding: 6px 0;" dir="ltr">${kmStr(body.serviceIntervalKm)}</td></tr>
        </table>
        <p style="margin-top: 16px;"><strong>חשבונית / צילום טיפול:</strong><br/>
          <a href="${safePhotoHref}" target="_blank" rel="noopener noreferrer">פתיחת קישור לתמונה</a>
        </p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">נשלח אוטומטית ממערכת Fleet Manager Pro.</p>
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
      return new Response(
        JSON.stringify({ error: `Resend error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await resendResp.json();
    return new Response(JSON.stringify({ success: true, result: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-service-update-notification error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
