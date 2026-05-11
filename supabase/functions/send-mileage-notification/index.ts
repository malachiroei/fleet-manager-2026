import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailBodyWithBrand } from '../_shared/emailBrandHeader.ts';
import { loadFilteredNotificationEmails, uniqueEmailList } from '../_shared/loadFilteredNotificationEmails.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, accept-profile, content-profile, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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
    return new Response(null, { status: 204, headers: corsHeaders });
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
        : null;

    const body = (await req.json()) as DirectMileageNotificationRequest;
    console.log('Payload received:', body);

    const extra = body.to && String(body.to).includes('@') ? [String(body.to).trim()] : [];
    const fromDb = admin ? await loadFilteredNotificationEmails(admin, 'mileage_update') : [];
    const recipients = uniqueEmailList([...extra, ...fromDb]);
    const to = recipients.length > 0 ? recipients : ['malachiroei@gmail.com'];
    const subject = body.subject;
    const km = Number(body.odometerReading);
    const safeUrl = escHtml(body.reportUrl);
    const innerHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2>דווח קילומטראז׳ חדש</h2>
        <p><strong>קילומטראז׳:</strong> ${km.toLocaleString('he-IL')} ק"מ</p>
        <p><strong>צילום לוח שעונים:</strong> <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">צפייה בתמונה</a></p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">
          נשלח אוטומטית ממערכת Fleet Manager Pro.
        </p>
      </div>
    `.trim();

    const html = supabaseUrl ? wrapEmailBodyWithBrand(supabaseUrl, innerHtml) : innerHtml;

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
          to,
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

