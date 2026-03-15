/**
 * send-invite
 * ────────────────────────────────────────────────────────────────────────────
 * Sends an invitation email to a new team member.
 *
 * Uses the **same method** as Vehicle Delivery emails:
 *   - Same service: Resend API (https://api.resend.com/emails)
 *   - Same secrets: RESEND_API_KEY, NOTIFY_FROM_EMAIL (see send-handover-notification)
 *   - Same pattern: Supabase Edge Function → Resend (no new setup required)
 *
 * Called by the client after inserting a row into org_invitations.
 * Request body: { org_id: string, email: string }
 *
 * Required env (same as handover): RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: NOTIFY_FROM_EMAIL, APP_URL
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL_DEFAULT = 'https://fleet-manager-2026.vercel.app';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Fleet Manager <onboarding@resend.dev>';
    const appUrl = Deno.env.get('APP_URL') ?? APP_URL_DEFAULT;

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error:
            'Missing required env secrets (RESEND_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as { org_id?: string; email?: string };
    const orgId = typeof body.org_id === 'string' ? body.org_id.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!orgId || !email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid org_id or email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: orgRow, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .maybeSingle();

    if (orgError) {
      throw new Error(`Failed to fetch organization: ${orgError.message}`);
    }

    const organizationName =
      (orgRow as { name?: string } | null)?.name?.trim() || 'הארגון';

    const link = appUrl.replace(/\/$/, '');
    const html = `
<div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc;">
  <div style="background: linear-gradient(135deg, #0d1b2e 0%, #1e3a5f 100%); padding: 28px 24px; border-radius: 12px 12px 0 0;">
    <h1 style="color: #22d3ee; margin: 0 0 6px; font-size: 20px;">הזמנה להצטרף לצוות</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 14px;">Fleet Manager Pro</p>
  </div>
  <div style="background: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
    <p style="font-size: 16px; color: #1e293b; margin-top: 0;">
      שלום,
    </p>
    <p style="color: #475569; line-height: 1.7;">
      <strong>${organizationName}</strong> מזמין/ה אותך להצטרף לצוות במערכת ניהול צי הרכבים.
    </p>
    <p style="color: #475569; line-height: 1.7;">
      לחץ/י על הקישור להלן כדי להיכנס לאפליקציה ולהתחיל:
    </p>
    <p style="margin: 20px 0;">
      <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">פתח את האפליקציה</a>
    </p>
    <p style="font-size: 13px; color: #64748b;">
      קישור: <a href="${link}" style="color: #0891b2;">${link}</a>
    </p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      נשלח על ידי Fleet Manager 2026
    </p>
  </div>
</div>
`.trim();

    const resendPayload = {
      from: fromEmail,
      to: [email],
      subject: `הזמנה להצטרף ל־${organizationName} — Fleet Manager Pro`,
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

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      throw new Error(`Resend API error (${resendResp.status}): ${errText}`);
    }

    const resendResult = (await resendResp.json()) as { id?: string };

    return new Response(
      JSON.stringify({
        success: true,
        email_id: resendResult.id,
        sent_to: email,
        organization_name: organizationName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('send-invite error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
