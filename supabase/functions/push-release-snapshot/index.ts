/**
 * דחיפת release_snapshot.json ל-GitHub (אופציונלי) — רק לריפו הטסט, לא לפרודקשן.
 * סודות: GITHUB_TOKEN, GITHUB_REPO=owner/name (fleet-manager-dev), GITHUB_BRANCH=dev (ברירת מחדל).
 * הגדר גם PRODUCTION_GITHUB_REPO=owner/fleet-manager-2026 — אם GITHUB_REPO תואם, הבקשה נחסמת.
 *
 * גוף בקשה: { "content": "<stringified JSON של הסנאפשוט>" }
 * או { "snapshot": { ...אובייקט } }
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { encode as base64Encode } from 'https://deno.land/std@0.190.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PATH = 'src/config/release_snapshot.json';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('GITHUB_TOKEN')?.trim();
    const repo = Deno.env.get('GITHUB_REPO')?.trim();
    const branch = Deno.env.get('GITHUB_BRANCH')?.trim() || 'dev';
    const path = Deno.env.get('GITHUB_SNAPSHOT_PATH')?.trim() || DEFAULT_PATH;

    if (!token || !repo) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing GITHUB_TOKEN or GITHUB_REPO — set Supabase secrets for push-release-snapshot',
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const productionRepoGuard = Deno.env.get('PRODUCTION_GITHUB_REPO')?.trim().toLowerCase();
    if (productionRepoGuard && repo.toLowerCase() === productionRepoGuard) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'push-release-snapshot cannot target production; only publish-version-snapshot may update the production repo',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: { content?: string; snapshot?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let text: string;
    if (typeof body.content === 'string' && body.content.trim()) {
      text = body.content.trim();
    } else if (body.snapshot && typeof body.snapshot === 'object') {
      text = JSON.stringify(body.snapshot, null, 2);
    } else {
      return new Response(JSON.stringify({ ok: false, error: 'Expected content or snapshot' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [owner, name] = repo.split('/').map((s) => s.trim());
    if (!owner || !name) {
      return new Response(JSON.stringify({ ok: false, error: 'GITHUB_REPO must be owner/name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiBase = `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`;
    const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    let sha: string | undefined;
    if (getRes.ok) {
      const meta = (await getRes.json()) as { sha?: string };
      sha = typeof meta.sha === 'string' ? meta.sha : undefined;
    } else if (getRes.status !== 404) {
      const errText = await getRes.text();
      return new Response(
        JSON.stringify({ ok: false, error: `GitHub GET failed: ${getRes.status} ${errText.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const b64 = base64Encode(new TextEncoder().encode(text));
    let commitVer = '?';
    try {
      commitVer = String((JSON.parse(text) as { version?: unknown }).version ?? '?');
    } catch {
      /* ignore */
    }
    const putBody: Record<string, string> = {
      message: `chore(release): push release_snapshot (${commitVer})`,
      content: b64,
      branch,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putBody),
    });

    const putText = await putRes.text();
    if (!putRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `GitHub PUT failed: ${putRes.status} ${putText.slice(0, 400)}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ ok: true, path, branch }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
