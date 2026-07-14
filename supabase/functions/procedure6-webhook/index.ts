/**
 * Resend Inbound webhook — create Procedure 6 complaint from call-center email.
 * Configure Resend inbound → POST this function URL (verify_jwt = false).
 * Dev: accept from roeima21@gmail.com with subject containing "התקבלה תלונה נוהל 6".
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  isProcedure6ComplaintSubject,
  normalizePlateDigits,
  parseProcedure6EmailBody,
  randomResponseToken,
} from '../_shared/procedure6EmailParse.ts';
import { notifyProcedure6NewComplaint } from '../_shared/notifyProcedure6NewComplaint.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

const FALLBACK_ORG_ID = '857f2311-2ec5-41d3-8e32-dacd450a9a77';
const DEV_FROM_ALLOW = 'roeima21@gmail.com';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function extractEmailAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim().toLowerCase();
}

async function verifyResendSvix(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
  if (!secret) {
    // Dev / unconfigured: allow (still gated by subject/from checks)
    return true;
  }
  const id = req.headers.get('svix-id') ?? '';
  const ts = req.headers.get('svix-timestamp') ?? '';
  const sigHeader = req.headers.get('svix-signature') ?? '';
  if (!id || !ts || !sigHeader) return false;
  try {
    const keyPart = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(keyPart), (c) => c.charCodeAt(0));
    const toSign = new TextEncoder().encode(`${id}.${ts}.${rawBody}`);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, toSign);
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    const candidates = sigHeader.split(' ').map((p) => p.replace(/^v1,/, '').trim());
    return candidates.some((c) => c === expected);
  } catch {
    return false;
  }
}

type ResendReceivedPayload = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    text?: string;
    html?: string;
    created_at?: string;
  };
};

async function fetchReceivingEmail(
  emailId: string,
  apiKey: string,
): Promise<{ text?: string; html?: string; subject?: string; from?: string } | null> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.warn('[procedure6-webhook] receiving fetch failed', res.status, await res.text());
    return null;
  }
  return (await res.json()) as {
    text?: string;
    html?: string;
    subject?: string;
    from?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const rawBody = await req.text();
    const okSig = await verifyResendSvix(req, rawBody);
    if (!okSig) return json({ error: 'Invalid webhook signature' }, 401);

    let payload: ResendReceivedPayload = {};
    try {
      payload = JSON.parse(rawBody) as ResendReceivedPayload;
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    // Allow direct test posts without Resend envelope
    const isDirectTest = clean((payload as { mode?: string }).mode) === 'direct_parse';
    const eventType = clean(payload.type);
    if (!isDirectTest && eventType && eventType !== 'email.received') {
      return json({ ok: true, ignored: true, reason: `event ${eventType}` });
    }

    const data = payload.data ?? {};
    let subject = clean(data.subject);
    let fromRaw = clean(data.from);
    let textBody = clean(data.text);
    let htmlBody = clean(data.html);

    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const emailId = clean(data.email_id);
    if (!isDirectTest && emailId && resendKey && (!textBody && !htmlBody)) {
      const full = await fetchReceivingEmail(emailId, resendKey);
      if (full) {
        textBody = clean(full.text) || textBody;
        htmlBody = clean(full.html) || htmlBody;
        subject = clean(full.subject) || subject;
        fromRaw = clean(full.from) || fromRaw;
      }
    }

    // Direct test body: { mode: "direct_parse", subject, from, text }
    if (isDirectTest) {
      const direct = payload as {
        subject?: string;
        from?: string;
        text?: string;
        html?: string;
      };
      subject = clean(direct.subject) || subject;
      fromRaw = clean(direct.from) || fromRaw;
      textBody = clean(direct.text) || textBody;
      htmlBody = clean(direct.html) || htmlBody;
    }

    const fromEmail = extractEmailAddress(fromRaw);
    if (!isProcedure6ComplaintSubject(subject)) {
      // Soft-accept emails to n6@… even without exact subject when body parses
      const peek = parseProcedure6EmailBody(textBody || htmlBody);
      if (!peek) {
        return json({ ok: true, ignored: true, reason: 'subject/body not procedure6' });
      }
    }

    // Dev gate: when TESTING_FROM_ONLY=true, only allow roeima21@gmail.com
    const testingOnly = (Deno.env.get('PROCEDURE6_TESTING_FROM_ONLY') ?? '').toLowerCase() === 'true';
    if (testingOnly && fromEmail !== DEV_FROM_ALLOW) {
      return json({ ok: true, ignored: true, reason: 'from not in allowlist' });
    }

    const parsed = parseProcedure6EmailBody(textBody || htmlBody);
    if (!parsed) {
      return json({ error: 'Could not parse Procedure 6 fields from email body' }, 422);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const asOf = parsed.report_date_time ?? new Date().toISOString();
    const { data: resolvedRows, error: resolveErr } = await admin.rpc(
      'resolve_procedure6_driver_for_plate',
      {
        p_plate: parsed.vehicle_number,
        p_as_of: asOf,
        p_org_id: null,
      },
    );
    if (resolveErr) {
      console.error('[procedure6-webhook] resolve RPC', resolveErr);
    }
    const resolved = Array.isArray(resolvedRows) ? resolvedRows[0] : resolvedRows;
    const orgId =
      clean((resolved as { org_id?: string } | null)?.org_id) ||
      clean(Deno.env.get('PROCEDURE6_DEFAULT_ORG_ID')) ||
      FALLBACK_ORG_ID;
    const vehicleId = clean((resolved as { vehicle_id?: string } | null)?.vehicle_id) || null;
    const driverId = clean((resolved as { driver_id?: string } | null)?.driver_id) || null;
    const driverName =
      clean((resolved as { driver_name?: string } | null)?.driver_name) ||
      parsed.driver_name ||
      (driverId ? null : 'ללא נהג');

    const responseToken = randomResponseToken();
    const plateDisplay =
      clean((resolved as { plate_number?: string } | null)?.plate_number) ||
      normalizePlateDigits(parsed.vehicle_number);

    const insertRow = {
      org_id: orgId,
      vehicle_id: vehicleId,
      driver_id: driverId || null,
      vehicle_number: plateDisplay || parsed.vehicle_number,
      report_id: parsed.report_id,
      report_type: 'תלונה',
      location: parsed.location,
      description: parsed.description,
      report_date_time: parsed.report_date_time,
      reporter_name: parsed.reporter_name,
      reporter_cell_phone: parsed.reporter_cell_phone,
      received_time: new Date().toISOString(),
      receiver_name: fromEmail || null,
      driver_name: driverName,
      driver_response: null,
      action_taken: null,
      status: 'open',
      response_token: responseToken,
      source: 'email_inbound',
    };

    const { data: inserted, error: insErr } = await admin
      .from('procedure6_complaints')
      .insert(insertRow)
      .select(
        'id, org_id, driver_id, vehicle_number, status, report_date_time, location, description, reporter_name, reporter_cell_phone, driver_name, report_id',
      )
      .single();

    if (insErr) {
      console.error('[procedure6-webhook] insert', insertRow, insErr);
      return json({ error: insErr.message }, 500);
    }

    // Staff copy: recipients from user_org_notification_routing topic procedure6_complaints
    let notify: { sent: boolean; to: string[]; error?: string } = {
      sent: false,
      to: [],
    };
    try {
      notify = await notifyProcedure6NewComplaint(admin, {
        org_id: orgId,
        vehicle_number: inserted.vehicle_number ?? plateDisplay,
        report_date_time: inserted.report_date_time ?? parsed.report_date_time,
        location: inserted.location ?? parsed.location,
        description: inserted.description ?? parsed.description,
        reporter_name: inserted.reporter_name ?? parsed.reporter_name,
        reporter_cell_phone: inserted.reporter_cell_phone ?? parsed.reporter_cell_phone,
        driver_name: inserted.driver_name ?? driverName,
        report_id: inserted.report_id ?? parsed.report_id,
      });
      if (!notify.sent) {
        console.warn('[procedure6-webhook] staff notify skipped/failed', notify);
      }
    } catch (notifyErr) {
      console.error('[procedure6-webhook] staff notify', notifyErr);
    }

    return json({
      ok: true,
      complaint: inserted,
      resolved_driver: Boolean(driverId),
      driver_label: driverName,
      staff_notified: notify.sent,
      staff_recipients: notify.to.length,
    });
  } catch (err) {
    console.error('[procedure6-webhook]', err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
