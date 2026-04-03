import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DirectMileageNotificationRequest {
  to?: string;
  subject: string;
  odometerReading: number;
  reportUrl: string;
}

function escHtml(s: string): string {
  return String(s ?? '')
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
    const fromEmail =
      Deno.env.get('NOTIFY_FROM_EMAIL') || 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Missing RESEND_API_KEY (set in Supabase Edge Function secrets for production)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as DirectMileageNotificationRequest;
    console.log('Payload received:', body);

    const to = (body.to && String(body.to).includes('@') ? String(body.to).trim() : '') || 'malachiroei@gmail.com';
    const subject = body.subject;
    const km = Number(body.odometerReading);
    const safeUrl = escHtml(body.reportUrl);
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2>דווח קילומטראז׳ חדש</h2>
        <p><strong>קילומטראז׳:</strong> ${km.toLocaleString('he-IL')} ק"מ</p>
        <p><strong>צילום לוח שעונים:</strong> <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">צפייה בתמונה</a></p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">
          נשלח אוטומטית ממערכת Fleet Manager Pro.
        </p>
      </div>
    `.trim();

    let result: unknown = null;
    try {
      console.log('Sending mileage notification via Resend to', to);
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
      console.log('Resend Response:', JSON.stringify(data));
      result = data;
    } catch (error) {
      console.error('Resend Error:', error);
      return new Response(
        JSON.stringify({ error: 'Resend request failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-mileage-notification error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

