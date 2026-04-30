import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as { token?: string };
    const token = clean(body.token);
    if (!token) return json({ error: 'Missing token' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing server secrets' }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    /** בלי consumed_at בעמודה — פרויקטים ללא מיגרציה 20260430122000 נכשלים ב-schema cache */
    const { data, error } = await admin
      .from('compliance_requests')
      .select('id, driver_id, driver_name, driver_email, task_key, task_label, status, due_date, request_url')
      .eq('request_token', token)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: 'Request not found' }, 404);
    if (data.status === 'completed' || data.status === 'expired') {
      return json({ error: 'הקישור אינו פעיל עוד או שהבקשה כבר הושלמה' }, 410);
    }

    if (data.status === 'sent') {
      await admin.from('compliance_requests').update({ status: 'opened' }).eq('id', data.id);
    }

    return json({
      success: true,
      item: {
        driver_name: data.driver_name,
        driver_email: data.driver_email,
        driver_id: data.driver_id,
        task_key: data.task_key,
        task_label: data.task_label,
        status: data.status,
        due_date: data.due_date,
        request_url: data.request_url,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
