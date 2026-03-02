import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  to: string;
  subject: string;
  payload: {
    handoverType: 'delivery' | 'return';
    assignmentMode?: 'permanent' | 'replacement';
    vehicleLabel: string;
    driverLabel: string;
    odometerReading: number;
    fuelLevel: number;
    notes: string | null;
    reportUrl: string;
    sentAt: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || 'Fleet Manager <onboarding@resend.dev>';

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing RESEND_API_KEY secret' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { to, subject, payload } = (await req.json()) as NotificationRequest;

    const html = `
      <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
        <h2>${payload.handoverType === 'delivery' ? 'עודכן טופס מסירת רכב' : 'עודכן טופס החזרת רכב'}</h2>
        <p><strong>סוג מסירה:</strong> ${payload.assignmentMode === 'replacement' ? 'מסירת רכב חליפי' : 'מסירה קבועה'}</p>
        <p><strong>רכב:</strong> ${payload.vehicleLabel}</p>
        <p><strong>נהג:</strong> ${payload.driverLabel}</p>
        <p><strong>קילומטראז':</strong> ${payload.odometerReading.toLocaleString('en-US')}</p>
        <p><strong>רמת דלק:</strong> ${payload.fuelLevel}/8</p>
        <p><strong>הערות:</strong> ${payload.notes || 'ללא'}</p>
        <p><strong>קישור לטופס:</strong> <a href="${payload.reportUrl}" target="_blank">פתיחת הטופס</a></p>
        <p><small>זמן שליחה: ${payload.sentAt}</small></p>
      </div>
    `;

    const resendResponse = await fetch('https://api.resend.com/emails', {
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

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      return new Response(
        JSON.stringify({ error: `Resend API error: ${errorText}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
