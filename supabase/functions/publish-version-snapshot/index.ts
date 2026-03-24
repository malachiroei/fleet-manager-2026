/**
 * פרסום version_snapshot.json ל-GitHub + סנכרון package.json / package-lock.json מריפו מקור + סימון ב-DB של פרודקשן.
 *
 * סודות (Supabase Functions):
 * - GITHUB_TOKEN; יעד: GITHUB_REPO או PRODUCTION_GITHUB_REPO (owner/name); GITHUB_BRANCH=master (ברירת מחדל)
 * - אופציונלי GITHUB_VERSION_SNAPSHOT_PATH (default src/config/version_snapshot.json)
 * - סנכרון תלויות (מומלץ): GITHUB_DEPENDENCIES_SOURCE_REPO=owner/fleet-manager-dev, GITHUB_DEPENDENCIES_SOURCE_BRANCH=dev
 *   — מעתיק package.json ו-package-lock.json מהמקור לענף היעד בפרו לפני עדכון ה-snapshot.
 * - אופציונלי PRODUCTION_SUPABASE_URL + PRODUCTION_SUPABASE_SERVICE_ROLE_KEY — עדכון system_settings בפרו
 *
 * גוף: { snapshot: { version, release_date, description, features[], ui_changes } }
 * דורש Authorization: Bearer <JWT> — רק malachiroei@gmail.com
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { decode as base64Decode, encode as base64Encode } from 'https://deno.land/std@0.190.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_PUBLISHER_EMAIL = 'malachiroei@gmail.com';
const DEFAULT_PATH = 'src/config/version_snapshot.json';

const githubHeaders = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

/** תוכן טקסט מקובץ בריפו (תומך ב-base64 או download_url לקבצים גדולים). */
async function fetchRepoFileText(
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  token: string,
): Promise<string> {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET ${owner}/${repo}/${filePath}@${ref}: ${res.status} ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    encoding?: string;
    content?: string;
    download_url?: string | null;
  };
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    const bytes = base64Decode(data.content.replace(/\s/g, ''));
    return new TextDecoder().decode(bytes);
  }
  if (typeof data.download_url === 'string' && data.download_url.length > 0) {
    const raw = await fetch(data.download_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    });
    if (!raw.ok) {
      throw new Error(`download_url ${filePath}: ${raw.status}`);
    }
    return await raw.text();
  }
  throw new Error(`Unexpected GitHub contents payload for ${filePath}`);
}

async function putRepoFile(
  destOwner: string,
  destRepo: string,
  filePath: string,
  destBranch: string,
  text: string,
  token: string,
  message: string,
): Promise<{ ok: true; commit_sha?: string } | { ok: false; error: string }> {
  const apiBase =
    `https://api.github.com/repos/${destOwner}/${destRepo}/contents/${encodeURIComponent(filePath)}`;
  const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(destBranch)}`, {
    headers: githubHeaders(token),
  });

  let sha: string | undefined;
  if (getRes.ok) {
    const meta = (await getRes.json()) as { sha?: string };
    sha = typeof meta.sha === 'string' ? meta.sha : undefined;
  } else if (getRes.status !== 404) {
    const errText = await getRes.text();
    return { ok: false, error: `GET dest ${filePath}: ${getRes.status} ${errText.slice(0, 200)}` };
  }

  const b64 = base64Encode(new TextEncoder().encode(text));
  const putBody: Record<string, string> = {
    message,
    content: b64,
    branch: destBranch,
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody),
  });

  const putText = await putRes.text();
  if (!putRes.ok) {
    return { ok: false, error: `PUT dest ${filePath}: ${putRes.status} ${putText.slice(0, 300)}` };
  }

  let commitSha: string | undefined;
  try {
    const putJson = JSON.parse(putText) as { commit?: { sha?: string } };
    commitSha = typeof putJson?.commit?.sha === 'string' ? putJson.commit.sha : undefined;
  } catch {
    /* ignore */
  }
  return { ok: true, commit_sha: commitSha };
}

serve(async (req) => {
  console.log('--- STARTING PUBLISH PROCESS ---');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Function missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing Authorization Bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const email = userData?.user?.email?.trim().toLowerCase() ?? '';
    if (userErr || !email) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (email !== ALLOWED_PUBLISHER_EMAIL) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden: publish allowed only for main publisher account' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { snapshot?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const snap = body.snapshot;
    if (!snap || typeof snap !== 'object') {
      return new Response(JSON.stringify({ ok: false, error: 'Expected body.snapshot object' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const version = typeof snap.version === 'string' ? snap.version.trim() : '';
    if (!version) {
      return new Response(JSON.stringify({ ok: false, error: 'snapshot.version required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = Deno.env.get('GITHUB_TOKEN')?.trim();
    const repo =
      Deno.env.get('GITHUB_REPO')?.trim() || Deno.env.get('PRODUCTION_GITHUB_REPO')?.trim();
    const branch = Deno.env.get('GITHUB_BRANCH')?.trim() || 'master';
    const path = Deno.env.get('GITHUB_VERSION_SNAPSHOT_PATH')?.trim() || DEFAULT_PATH;

    if (!token || !repo) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing GITHUB_TOKEN or GITHUB_REPO/PRODUCTION_GITHUB_REPO — set Supabase secrets for publish-version-snapshot',
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Using Token starting with:', Deno.env.get('GITHUB_TOKEN')?.slice(0, 4));

    const [owner, name] = repo.split('/').map((s) => s.trim());
    if (!owner || !name) {
      return new Response(JSON.stringify({ ok: false, error: 'GITHUB_REPO must be owner/name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dependenciesSync: Record<string, unknown> = {
      skipped: true,
      reason: 'Set GITHUB_DEPENDENCIES_SOURCE_REPO (and optionally GITHUB_DEPENDENCIES_SOURCE_BRANCH) to sync package files',
    };

    const depSourceRepoRaw = Deno.env.get('GITHUB_DEPENDENCIES_SOURCE_REPO')?.trim();
    const depSourceBranch = Deno.env.get('GITHUB_DEPENDENCIES_SOURCE_BRANCH')?.trim() || 'dev';

    if (depSourceRepoRaw) {
      const [so, sn] = depSourceRepoRaw.split('/').map((s) => s.trim());
      if (!so || !sn) {
        dependenciesSync = { skipped: true, reason: 'invalid GITHUB_DEPENDENCIES_SOURCE_REPO (expected owner/name)' };
      } else {
        try {
          const depFiles = ['package.json', 'package-lock.json'] as const;
          const fileResults: Record<string, unknown>[] = [];
          for (const fp of depFiles) {
            const content = await fetchRepoFileText(so, sn, fp, depSourceBranch, token);
            const put = await putRepoFile(
              owner,
              name,
              fp,
              branch,
              content,
              token,
              `chore(release): sync ${fp} for ${version} from ${depSourceRepoRaw}@${depSourceBranch}`,
            );
            if (!put.ok) {
              throw new Error(put.error);
            }
            fileResults.push({ path: fp, updated: true, commit_sha: put.commit_sha ?? null });
          }
          dependenciesSync = {
            skipped: false,
            source_repo: depSourceRepoRaw,
            source_branch: depSourceBranch,
            files: fileResults,
          };
        } catch (error) {
          console.error('GITHUB API ERROR (dependencies sync):', error);
          const detail = error instanceof Error ? error.message : String(error);
          return new Response(
            JSON.stringify({ ok: false, error: `Dependencies sync failed: ${detail}` }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    let commitSha: string | undefined;
    try {
      const apiBase = `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`;
      const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
        headers: githubHeaders(token),
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

      const text = JSON.stringify(snap, null, 2);
      const b64 = base64Encode(new TextEncoder().encode(text));
      const putBody: Record<string, string> = {
        message: `chore(release): version_snapshot ${version}`,
        content: b64,
        branch,
      };
      if (sha) putBody.sha = sha;

      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers: {
          ...githubHeaders(token),
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

      try {
        const putJson = JSON.parse(putText) as { commit?: { sha?: string } };
        commitSha = typeof putJson?.commit?.sha === 'string' ? putJson.commit.sha : undefined;
      } catch {
        /* ignore */
      }
    } catch (error) {
      console.error('GITHUB API ERROR:', error);
      const detail = error instanceof Error ? error.message : String(error);
      return new Response(
        JSON.stringify({ ok: false, error: `GitHub API error: ${detail}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prodUrl = Deno.env.get('PRODUCTION_SUPABASE_URL')?.trim();
    const prodKey = Deno.env.get('PRODUCTION_SUPABASE_SERVICE_ROLE_KEY')?.trim();

    let productionResult: Record<string, unknown> = { skipped: true, reason: 'PRODUCTION_* secrets not set' };
    if (prodUrl && prodKey) {
      const prod = createClient(prodUrl, prodKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const publishedAt = new Date().toISOString();
      const value = {
        ...snap,
        ready: true,
        published_at: publishedAt,
      };
      const { error: upErr } = await prod.from('system_settings').upsert(
        { key: 'version_snapshot_published', value },
        { onConflict: 'key' },
      );
      if (upErr) {
        productionResult = { updated: false, error: upErr.message };
      } else {
        productionResult = { updated: true, key: 'version_snapshot_published', published_at: publishedAt };
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        github: { path, branch, commit_sha: commitSha ?? null },
        dependencies_sync: dependenciesSync,
        production: productionResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
