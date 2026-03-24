/**
 * פרסום version_snapshot.json ל-GitHub + סנכרון package.json / package-lock.json מריפו מקור + סימון ב-DB של פרודקשן.
 *
 * סודות (Supabase Functions):
 * - GITHUB_TOKEN; יעד: GITHUB_REPO או PRODUCTION_GITHUB_REPO (owner/name); GITHUB_BRANCH=master (ברירת מחדל)
 * - אופציונלי GITHUB_VERSION_SNAPSHOT_PATH (default src/config/version_snapshot.json)
 * - סנכרון תלויות (חובה בכל פרסום): לפני version_snapshot — דוחף package.json + package-lock.json לענף היעד.
 *   מקור: GITHUB_DEPENDENCIES_SOURCE_REPO (owner/name) או ברירת מחדל כשהיעד fleet-manager-2026 → malachiroei/fleet-manager-dev.
 *   ענף מקור: GITHUB_DEPENDENCIES_SOURCE_BRANCH (ברירת מחדל dev). נכשל אם ה-JSON לא תקין.
 * - אופציונלי PRODUCTION_SUPABASE_URL + PRODUCTION_SUPABASE_SERVICE_ROLE_KEY — עדכון system_settings בפרו
 *
 * גוף: { snapshot: { version, release_date, description, features[], ui_changes } }
 * דורש Authorization: Bearer <JWT> — רק malachiroei@gmail.com
 */
/** std: שרת HTTP + base64 — תבנית רשמית של Supabase Edge; חבילת אפליקציה חיצונית דרך esm.sh בלבד. */
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

/** לוג מלא ל-Supabase Functions logs (גוף התשובה נצרך פעם אחת). */
async function logGithubFullError(res: Response, context: string): Promise<string> {
  const body = await res.text();
  console.error('GITHUB FULL ERROR:', context, 'status=', res.status, 'body=', body);
  return body;
}

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
      await logGithubFullError(raw, `GET download_url ${filePath}`);
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
    const errText = await logGithubFullError(getRes, `GET dest sha ${destOwner}/${destRepo}/${filePath}`);
    return { ok: false, error: `GET dest ${filePath}: ${getRes.status} ${errText.slice(0, 400)}` };
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
    console.error('GITHUB FULL ERROR:', `PUT dest ${destOwner}/${destRepo}/${filePath}`, 'status=', putRes.status, 'body=', putText);
    return { ok: false, error: `PUT dest ${filePath}: ${putRes.status} ${putText.slice(0, 500)}` };
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

/** מקור לתלויות: סוד מפורש או זיווג ידוע prod→staging */
function resolveDependencySourceRepo(destOwner: string, destRepoName: string): {
  repoFull: string;
  owner: string;
  name: string;
  via: 'GITHUB_DEPENDENCIES_SOURCE_REPO' | 'default_fleet_manager_pair';
} {
  const explicit = Deno.env.get('GITHUB_DEPENDENCIES_SOURCE_REPO')?.trim();
  if (explicit) {
    const m = explicit.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (!m) {
      throw new Error('GITHUB_DEPENDENCIES_SOURCE_REPO must be exactly owner/name');
    }
    return { repoFull: `${m[1]}/${m[2]}`, owner: m[1], name: m[2], via: 'GITHUB_DEPENDENCIES_SOURCE_REPO' };
  }
  if (destRepoName.toLowerCase() === 'fleet-manager-2026') {
    const stagingOwner = 'malachiroei';
    return {
      repoFull: `${stagingOwner}/fleet-manager-dev`,
      owner: stagingOwner,
      name: 'fleet-manager-dev',
      via: 'default_fleet_manager_pair',
    };
  }
  throw new Error(
    `Cannot infer dependency source for ${destOwner}/${destRepoName}. Set secret GITHUB_DEPENDENCIES_SOURCE_REPO=owner/staging-repo`,
  );
}

serve(async (req) => {
  console.log('--- STARTING PUBLISH PROCESS ---');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const rawGithubToken = Deno.env.get('GITHUB_TOKEN');
  const token = rawGithubToken?.trim();
  console.log('Token check:', token ? 'Exists (starts with ' + token.slice(0, 4) + ')' : 'MISSING');
  if (!token) {
    console.error('CRITICAL: GITHUB_TOKEN is missing from environment variables');
    return new Response(JSON.stringify({ ok: false, error: 'Missing Token' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (rawGithubToken != null && rawGithubToken !== token) {
    console.warn('GITHUB_TOKEN had leading/trailing whitespace — trimmed for GitHub API');
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
    } catch (jsonErr) {
      console.error('req.json() failed:', jsonErr);
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { snapshot } = body;
    console.log('Snapshot received:', !!snapshot);
    const snap = snapshot;
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

    const repo =
      Deno.env.get('GITHUB_REPO')?.trim() || Deno.env.get('PRODUCTION_GITHUB_REPO')?.trim();
    const branch = Deno.env.get('GITHUB_BRANCH')?.trim() || 'master';
    const path = Deno.env.get('GITHUB_VERSION_SNAPSHOT_PATH')?.trim() || DEFAULT_PATH;

    if (!repo) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing GITHUB_REPO or PRODUCTION_GITHUB_REPO — set Supabase secrets for publish-version-snapshot',
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const [owner, name] = repo.split('/').map((s) => s.trim());
    if (!owner || !name) {
      return new Response(JSON.stringify({ ok: false, error: 'GITHUB_REPO must be owner/name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const depSourceBranch = Deno.env.get('GITHUB_DEPENDENCIES_SOURCE_BRANCH')?.trim() || 'dev';

    let dependenciesSync: Record<string, unknown>;
    try {
      const src = resolveDependencySourceRepo(owner, name);
      const depFiles = ['package.json', 'package-lock.json'] as const;
      const fileResults: Record<string, unknown>[] = [];
      for (const fp of depFiles) {
        const content = await fetchRepoFileText(src.owner, src.name, fp, depSourceBranch, token);
        try {
          JSON.parse(content);
        } catch {
          throw new Error(`Source ${fp} is not valid JSON — aborting production sync`);
        }
        const put = await putRepoFile(
          owner,
          name,
          fp,
          branch,
          content,
          token,
          `chore(release): sync ${fp} for ${version} from ${src.repoFull}@${depSourceBranch}`,
        );
        if (!put.ok) {
          throw new Error(put.error);
        }
        fileResults.push({ path: fp, updated: true, commit_sha: put.commit_sha ?? null });
      }
      dependenciesSync = {
        skipped: false,
        source_repo: src.repoFull,
        source_branch: depSourceBranch,
        resolved_via: src.via,
        files: fileResults,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const status = /GITHUB_DEPENDENCIES_SOURCE_REPO must be exactly owner\/name/.test(msg)
        ? 400
        : /Cannot infer dependency source/.test(msg)
          ? 501
          : 502;
      console.error('DEPENDENCIES SYNC FAILED:', error);
      return new Response(
        JSON.stringify({ ok: false, error: `Dependencies sync failed: ${msg}` }),
        {
          status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
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
        const errText = await logGithubFullError(getRes, `GET snapshot ${path}@${branch}`);
        return new Response(
          JSON.stringify({ ok: false, error: `GitHub GET failed: ${getRes.status} ${errText.slice(0, 400)}` }),
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
        console.error('GITHUB FULL ERROR:', `PUT snapshot ${path}`, 'status=', putRes.status, 'body=', putText);
        return new Response(
          JSON.stringify({ ok: false, error: `GitHub PUT failed: ${putRes.status} ${putText.slice(0, 500)}` }),
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
