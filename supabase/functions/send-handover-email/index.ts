/**
 * send-handover-email
 * ────────────────────────────────────────────────────────────────────────────
 * Triggered by a Supabase Database Webhook on INSERT into driver_documents.
 *
 * Flow:
 *  1. Receive the new row from the webhook payload.
 *  2. Ignore rows whose title does not start with "handover_receipt" —
 *     those are the first (anchor) document of every wizard session.
 *  3. Wait 5 s so that all 5 wizard documents finish inserting.
 *  4. Fetch all driver_documents for the same driver created in the
 *     last 90 seconds (= all docs from this wizard run).
 *  5. Resolve the driver's name + email from the drivers table.
 *  6. Download every file from Storage (image/pdf) and base64-encode it.
 *  7. Send a single email to the driver (+ BCC to fleet manager) via Resend,
 *     with all documents attached.
 *
 * Required env secrets (set via `supabase secrets set`):
 *   RESEND_API_KEY
 *   SUPABASE_URL           (auto-injected by Supabase runtime)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase runtime)
 *
 * Optional:
 *   NOTIFY_FROM_EMAIL      default: "Fleet Manager <onboarding@resend.dev>"
 *   FLEET_MANAGER_EMAIL    default: "malachiroei@gmail.com"
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Convert a Uint8Array to base64 (safe for large files). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Guess a mime-type from the file URL extension. */
function mimeFromUrl(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf:  'application/pdf',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif:  'image/gif',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Extract a friendly filename from a title + URL pair. */
function filenameFromDoc(title: string, url: string): string {
  const typeMap: Record<string, string> = {
    handover_receipt:    'טופס-קבלת-רכב-חתימה',
    procedure_agreement: 'נוהל-04-05-001-חתימה',
    health_declaration:  'הצהרת-בריאות-חתימה',
    license_front:       'רישיון-נהיגה-צד-א',
    license_back:        'רישיון-נהיגה-צד-ב',
  };
  const typeKey = Object.keys(typeMap).find((k) => title.startsWith(k)) ?? '';
  const friendlyName = typeMap[typeKey] ?? title.split(' | ')[0];
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? 'png';
  return `${friendlyName}.${ext}`;
}

// ── Title label used in the email body ──────────────────────────────────────
const DOC_LABEL: Record<string, string> = {
  handover_receipt:    'טופס קבלת רכב (חתימה)',
  procedure_agreement: 'נוהל 04-05-001 — קבלת תנאי שימוש (חתימה)',
  health_declaration:  'הצהרת בריאות (חתימה)',
  license_front:       'רישיון נהיגה — צד א׳',
  license_back:        'רישיון נהיגה — צד ב׳',
};

function docLabel(title: string): string {
  const key = Object.keys(DOC_LABEL).find((k) => title.startsWith(k));
  return key ? DOC_LABEL[key] : title;
}

// ── Webhook payload shape ────────────────────────────────────────────────────
interface DriverDocRow {
  id: string;
  driver_id: string;
  file_url: string;
  title: string;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: DriverDocRow;
  old_record: DriverDocRow | null;
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── env vars ────────────────────────────────────────────────────────────
    const resendApiKey        = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl         = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fromEmail           = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Fleet Manager Pro <invites@fleet-manager-pro.com>';
    // FLEET_MANAGER_EMAIL is now a last-resort fallback only — real list comes from system_settings
    const fallbackManagerEmail = Deno.env.get('FLEET_MANAGER_EMAIL') ?? 'malachiroei@gmail.com';

    if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required env secrets (RESEND_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── parse webhook body ───────────────────────────────────────────────────
    const body = (await req.json()) as WebhookPayload;

    // Only handle INSERT events
    if (body.type !== 'INSERT') {
      return new Response(JSON.stringify({ skipped: 'not an INSERT' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newDoc = body.record;

    // Only trigger on the anchor document (handover_receipt)
    if (!newDoc.title?.startsWith('handover_receipt')) {
      return new Response(JSON.stringify({ skipped: 'not an anchor handover_receipt doc' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── wait for all wizard documents to be inserted ─────────────────────────
    await delay(5000);

    // ── Supabase admin client ────────────────────────────────────────────────
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 0. Resolve CC recipients from system_settings ────────────────────────
    let ccEmails: string[] = [fallbackManagerEmail];
    try {
      const { data: settingsRow } = await supabase
        .from('system_settings' as never)
        .select('value')
        .eq('key', 'notification_emails')
        .maybeSingle() as { data: { value: unknown } | null };
      const arr = settingsRow?.value;
      if (Array.isArray(arr) && arr.length > 0) {
        ccEmails = (arr as string[]).filter((e) => typeof e === 'string' && e.includes('@'));
      }
    } catch (settingsErr) {
      console.warn('Could not read system_settings.notification_emails — using env fallback:', settingsErr);
    }

    // ── 1. Fetch all docs from this wizard session ───────────────────────────
    //   All docs for the same driver inserted within 90 seconds of the anchor
    const since = new Date(new Date(newDoc.created_at).getTime() - 5_000).toISOString(); // -5s safety
    const until = new Date(new Date(newDoc.created_at).getTime() + 90_000).toISOString();

    const { data: sessionDocs, error: docsErr } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('driver_id', newDoc.driver_id)
      .gte('created_at', since)
      .lte('created_at', until)
      .order('created_at', { ascending: true });

    if (docsErr) {
      throw new Error(`Failed to fetch session docs: ${docsErr.message}`);
    }

    const docs = (sessionDocs ?? []) as DriverDocRow[];

    // ── 2. Fetch driver info ─────────────────────────────────────────────────
    const { data: driverRow, error: driverErr } = await supabase
      .from('drivers')
      .select('full_name, email, phone, license_number')
      .eq('id', newDoc.driver_id)
      .maybeSingle();

    if (driverErr) {
      throw new Error(`Failed to fetch driver: ${driverErr.message}`);
    }

    const driverName  = (driverRow as { full_name?: string } | null)?.full_name ?? 'נהג';
    const driverEmail = (driverRow as { email?: string | null } | null)?.email;
    const licenseNum  = (driverRow as { license_number?: string | null } | null)?.license_number ?? '';

    if (!driverEmail) {
      // No email → log and exit gracefully (don't fail the webhook)
      console.warn(`Driver ${newDoc.driver_id} has no email address — skipping send.`);
      return new Response(
        JSON.stringify({ skipped: 'driver has no email', driver_id: newDoc.driver_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Download each file and encode as base64 ───────────────────────────
    interface Attachment {
      filename: string;
      content:  string; // base64
      type:     string;
    }

    const attachments: Attachment[] = [];

    for (const doc of docs) {
      try {
        const resp = await fetch(doc.file_url);
        if (!resp.ok) {
          console.warn(`Could not download ${doc.file_url} (${resp.status}) — skipping attachment`);
          continue;
        }
        const bytes = new Uint8Array(await resp.arrayBuffer());
        attachments.push({
          filename: filenameFromDoc(doc.title, doc.file_url),
          content:  toBase64(bytes),
          type:     mimeFromUrl(doc.file_url),
        });
      } catch (dlErr) {
        console.warn(`Download error for ${doc.file_url}:`, dlErr);
      }
    }

    // ── 4. Build email HTML ───────────────────────────────────────────────────
    const docListHtml = docs
      .map((d) => `<li style="padding: 4px 0;">📎 ${docLabel(d.title)}</li>`)
      .join('');

    const sentAt = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    const html = `
<div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">

  <!-- Header -->
  <div style="background: linear-gradient(135deg, #0d1b2e 0%, #1e3a5f 100%); padding: 32px 28px; border-radius: 12px 12px 0 0;">
    <h1 style="color: #22d3ee; margin: 0 0 6px; font-size: 22px;">✅ אשף מסירת רכב — הושלם בהצלחה</h1>
    <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 14px;">מערכת ניהול ציי רכב — Fleet Manager 2026</p>
  </div>

  <!-- Body -->
  <div style="background: #ffffff; padding: 28px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">

    <p style="font-size: 16px; color: #1e293b; margin-top: 0;">
      שלום <strong>${driverName}</strong>,
    </p>
    <p style="color: #475569; line-height: 1.7;">
      תהליך קבלת הרכב הושלם בהצלחה. כל המסמכים שנחתמו ונסרקו נשמרו בתיק הנהג שלך במערכת.
      מצורפים לאימייל זה <strong>${attachments.length} קבצים</strong>:
    </p>

    <ul style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 24px; color: #334155; font-size: 14px; line-height: 1.8;">
      ${docListHtml}
    </ul>

    ${licenseNum ? `<p style="color: #64748b; font-size: 13px; margin-top: 0;">מספר רישיון נהיגה: <strong>${licenseNum}</strong></p>` : ''}

    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      נשלח אוטומטית על-ידי Fleet Manager 2026 · ${sentAt}
    </p>
  </div>
</div>
    `.trim();

    // ── 5. Send via Resend ────────────────────────────────────────────────────
    // Driver gets the email; all system_settings addresses are CC'd
    const recipients = [driverEmail];
    for (const cc of ccEmails) {
      if (cc !== driverEmail && !recipients.includes(cc)) {
        recipients.push(cc);
      }
    }

    const resendPayload = {
      from:        fromEmail,
      to:          recipients,
      subject:     `✅ מסמכי מסירת רכב — ${driverName} | ${sentAt}`,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content:  a.content,
        type:     a.type,
      })),
    };

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      throw new Error(`Resend API error (${resendResp.status}): ${errText}`);
    }

    const resendResult = await resendResp.json();

    return new Response(
      JSON.stringify({
        success:     true,
        email_id:    resendResult.id,
        sent_to:     recipients,
        attachments: attachments.length,
        docs_found:  docs.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('send-handover-email error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
