import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DirectMileageNotificationRequest {
  to: string;
  subject: string;
  odometerReading: number;
  reportUrl: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fromEmail = 'onboarding@resend.dev';

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error: 'Missing required env secrets (RESEND_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as DirectMileageNotificationRequest;
    console.log('Payload received:', body);

    const to = 'malachiroei@gmail.com';
    const subject = body.subject;
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2>דווח קילומטראז׳ חדש</h2>
        <p><strong>קילומטראז׳:</strong> ${Number(body.odometerReading).toLocaleString('he-IL')} ק"מ</p>
        <p><strong>צילום לוח שעונים:</strong> <a href="${body.reportUrl}" target="_blank">צפייה בתמונה</a></p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">
          נשלח אוטומטית ממערכת Fleet Manager Pro.
        </p>
      </div>
    `.trim();

    let result: unknown = null;
    try {
      console.log('Sending email to malachiroei@gmail.com via Resend...');
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

