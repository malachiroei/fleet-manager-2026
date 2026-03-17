import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload<TRecord> {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: TRecord;
  old_record: TRecord | null;
}

interface MileageLogRow {
  user_id: string;
  vehicle_id: string;
  odometer_value: number;
  photo_url: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fromEmail =
      Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error:
            'Missing required env secrets (RESEND_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payload = (await req.json()) as WebhookPayload<MileageLogRow>;

    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ skipped: 'not an INSERT' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const log = payload.record;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Resolve driver name (via profiles/drivers) and vehicle plate
    const [{ data: profileRow }, { data: vehicleRow }] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', log.user_id)
        .maybeSingle(),
      supabase
        .from('vehicles')
        .select('plate_number')
        .eq('id', log.vehicle_id)
        .maybeSingle(),
    ]);

    const driverName =
      (profileRow as { full_name?: string | null } | null)?.full_name ?? 'נהג';
    const vehicleNumber =
      (vehicleRow as { plate_number?: string | null } | null)?.plate_number ??
      log.vehicle_id;

    const to = 'malachiroei@gmail.com';
    const subject = `📈 דיווח קילומטראז׳ חדש — ${vehicleNumber}`;

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
        <h2>דווח קילומטראז׳ חדש</h2>
        <p><strong>נהג:</strong> ${driverName}</p>
        <p><strong>רכב:</strong> ${vehicleNumber}</p>
        <p><strong>קילומטראז׳:</strong> ${Number(log.odometer_value).toLocaleString('he-IL')} ק"מ</p>
        ${
          log.photo_url
            ? `<p><strong>צילום לוח שעונים:</strong> <a href="${log.photo_url}" target="_blank">צפייה בתמונה</a></p>`
            : ''
        }
        <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">
          נשלח אוטומטית ממערכת Fleet Manager Pro.
        </p>
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
      console.error('Resend mileage notification error:', errText);
      return new Response(
        JSON.stringify({ error: `Resend error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await resendResp.json();

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

