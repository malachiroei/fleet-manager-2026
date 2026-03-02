import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  to: string;
  subject: string;
  payload: {
    handoverId?: string;
    vehicleId?: string;
    handoverType: 'delivery' | 'return';
    assignmentMode?: 'permanent' | 'replacement';
    vehicleLabel: string;
    driverLabel: string;
    odometerReading: number;
    fuelLevel: number;
    notes: string | null;
    recordUrl?: string;
    reportUrl: string;
    sentAt: string;
  };
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || 'Fleet Manager <onboarding@resend.dev>';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing RESEND_API_KEY secret' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { to, subject, payload } = (await req.json()) as NotificationRequest;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    let persistedPdfUrl = payload.reportUrl;
    if (payload.handoverId) {
      const { data: handoverRow, error: handoverError } = await supabase
        .from('vehicle_handovers')
        .select('pdf_url')
        .eq('id', payload.handoverId)
        .maybeSingle();

      if (handoverError) {
        return new Response(
          JSON.stringify({ error: `PDF copy failed: unable to read handover pdf_url (${handoverError.message})` }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const dbPdfUrl = (handoverRow as { pdf_url?: string | null } | null)?.pdf_url;
      if (dbPdfUrl) {
        persistedPdfUrl = dbPdfUrl;
      }
    }

    if (!persistedPdfUrl || persistedPdfUrl === 'לא נוצר קישור לטופס') {
      return new Response(
        JSON.stringify({ error: 'PDF copy failed: pdf_url is missing on handover record' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const pdfResponse = await fetch(persistedPdfUrl);
    if (!pdfResponse.ok) {
      return new Response(
        JSON.stringify({ error: `PDF copy failed: unable to fetch file from storage (${pdfResponse.status})` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfContentBase64 = toBase64(pdfBytes);

    const appBaseUrl = 'https://fleet-manager-2026.vercel.app';
    const recordUrl = payload.recordUrl || (payload.vehicleId && payload.handoverId
      ? `${appBaseUrl}/vehicles/${payload.vehicleId}#handover-${payload.handoverId}`
      : persistedPdfUrl);

    const html = `
      <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
        <h2>${payload.handoverType === 'delivery' ? 'עודכן טופס מסירת רכב' : 'עודכן טופס החזרת רכב'}</h2>
        <p><strong>סוג מסירה:</strong> ${payload.assignmentMode === 'replacement' ? 'מסירת רכב חליפי' : 'מסירה קבועה'}</p>
        <p><strong>רכב:</strong> ${payload.vehicleLabel}</p>
        <p><strong>נהג:</strong> ${payload.driverLabel}</p>
        <p><strong>קילומטראז':</strong> ${payload.odometerReading.toLocaleString('en-US')}</p>
        <p><strong>רמת דלק:</strong> ${payload.fuelLevel}/8</p>
        <p><strong>הערות:</strong> ${payload.notes || 'ללא'}</p>
        <p><strong>קישור לרישום המסירה:</strong> <a href="${recordUrl}" target="_blank">צפייה ברישום</a></p>
        <p><strong>טופס חתום/ארכיון:</strong> <a href="${persistedPdfUrl}" target="_blank">View Form</a></p>
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
        attachments: [
          {
            filename: `handover-${payload.handoverId ?? 'report'}.pdf`,
            content: pdfContentBase64,
          },
        ],
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
