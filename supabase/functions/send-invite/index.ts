/**
 * send-invite (Resend – production)
 * ────────────────────────────────────────────────────────────────────────────
 * Sends an invitation email via Resend API.
 * From: Fleet Manager Pro <invites@fleet-manager-pro.com> (verified domain).
 * Sends to the email provided in the request body.
 *
 * Request body: { org_id: string, email: string }
 * Secret: RESEND_API_KEY (npx supabase secrets set RESEND_API_KEY=re_...)
 * Invite link base URL: always https://fleet-manager-pro.com (no vercel.app).
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL_DEFAULT = 'https://fleet-manager-pro.com';

const FROM_EMAIL = 'Fleet Manager Pro <invites@fleet-manager-pro.com>';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[send-invite] Request received', { method: req.method });

  try {
    let body: { org_id?: string; email?: string };
    try {
      body = (await req.json()) as { org_id?: string; email?: string };
    } catch (parseErr) {
      console.error('[send-invite] Invalid JSON body:', parseErr);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const orgId = typeof body.org_id === 'string' ? body.org_id.trim() : '';
    const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const email = emailRaw && emailRaw.includes('@') ? emailRaw : '';

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing org_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('[send-invite] Parsed input', {
      org_id: orgId,
      to: `${email.slice(0, 2)}***@***`,
    });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[send-invite] Missing RESEND_API_KEY');
      return new Response(
        JSON.stringify({
          error: 'Missing RESEND_API_KEY. Set with: npx supabase secrets set RESEND_API_KEY=re_...',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appUrl = APP_URL_DEFAULT.replace(/\/$/, '');

    let organizationName = 'הארגון';
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle();
      organizationName = (orgRow as { name?: string } | null)?.name?.trim() || organizationName;
    }

    const html = `
<div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <h1 style="color: #0f172a;">הזמנה להצטרף לצוות</h1>
  <p><strong>${organizationName}</strong> מזמין/ה אותך להצטרף לצוות.</p>
  <p>ההזמנה נרשמה עבור: <strong>${email}</strong></p>
  <p><a href="${appUrl}/auth/callback" style="color: #0891b2;">קבל את ההזמנה ופתח את האפליקציה</a></p>
  <p style="color: #64748b; font-size: 12px;">Fleet Manager Pro</p>
</div>`.trim();

    const resendPayload = {
      from: FROM_EMAIL,
      to: [email],
      subject: `הזמנה להצטרף ל־${organizationName} — Fleet Manager Pro`,
      html,
    };
    console.log('[send-invite] Sending to:', email);

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
      console.error('[send-invite] Resend API error', { status: resendResp.status, body: resendBody });
      return new Response(
        JSON.stringify({ error: `Resend API error (${resendResp.status}): ${resendBody}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let resendResult: { id?: string } = {};
    try {
      resendResult = JSON.parse(resendBody) as { id?: string };
    } catch {
      console.warn('[send-invite] Resend response not JSON:', resendBody?.slice(0, 200));
    }
    console.log('[send-invite] Success', { email_id: resendResult.id, sent_to: email });

    return new Response(
      JSON.stringify({
        success: true,
        email_id: resendResult.id,
        sent_to: email,
        invite_for: email,
        organization_name: organizationName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-invite] Error:', message);
    if (err instanceof Error && err.stack) console.error('[send-invite] Stack:', err.stack);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
