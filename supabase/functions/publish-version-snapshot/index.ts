/**
 * פרסום version_snapshot.json ל-GitHub + סנכרון package.json / package-lock.json מריפו מקור + סימון ב-DB של פרודקשן.
 *
 * סודות (Supabase Functions):
 * - GITHUB_TOKEN; יעד קבוע לפרסום: malachiroei/fleet-manager-2026 (ענף: GITHUB_BRANCH או master)
 * - אופציונלי GITHUB_VERSION_SNAPSHOT_PATH (default src/config/version_snapshot.json)
 * - סנכרון תלויות: GITHUB_DEPENDENCIES_SOURCE_REPO או זיווג ברירת מחדל fleet-manager-2026 → malachiroei/fleet-manager-dev
 * - GITHUB_DEPENDENCIES_SOURCE_BRANCH (ברירת מחדל dev)
 * - אופציונלי PRODUCTION_SUPABASE_URL + PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
 *
 * גוף: { snapshot: { version, release_date, description, features[], ui_changes } }
 * (כש־TEMP_SKIP_JWT_USER_CHECK=false) דורש Authorization: Bearer <JWT> — רק malachiroei@gmail.com
 *
 * GitHub: רק fetch() ל-api.github.com (ללא Octokit). ייבוא: serve (deno.land), createClient (esm.sh).
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_PUBLISHER_EMAIL = 'malachiroei@gmail.com';
const DEFAULT_PATH = 'src/config/version_snapshot.json';

/**
 * TEMP — דילוג על `admin.auth.getUser` + דרישת Bearer (בדיקת GitHub / 401).
 * להחזיר ל־`false`, לפרוס מחדש **בלי** `--no-verify-jwt`, לפני פרודקשן.
 */
const TEMP_SKIP_JWT_USER_CHECK = false;

/** יעד הפרסום ב-GitHub — חייב להיות בדיוק malachiroei/fleet-manager-2026 */
const GITHUB_DEST_OWNER = 'malachiroei';
const GITHUB_DEST_REPO = 'fleet-manager-2026';
/** מחרוזת יעד לפרסום — חייבת להיות זהה ל־malachiroei/fleet-manager-2026 */
const GITHUB_DEST_FULL = 'malachiroei/fleet-manager-2026';

const GITHUB_FETCH_TIMEOUT_MS = 10_000;

/**
 * fetch ל-GitHub עם timeout; דיאגנוזה אגרסיבית — URL מדויק + catch רחב.
 */
async function githubFetch(label: string, url: string, init?: RequestInit): Promise<Response> {
  console.log('Attempting GitHub access to:', url);
  console.log('Fetching from GitHub...', label, url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      console.error('CATCHED ERROR:', err);
      if (err instanceof Error) {
        console.error('CATCHED ERROR name:', err.name, 'message:', err.message);
        if (err.stack) console.error('CATCHED ERROR stack:', err.stack);
      } else {
        console.error('CATCHED ERROR (non-Error):', String(err), typeof err);
      }
      throw err;
    }
    console.log('GitHub fetch done', label, res.status, res.ok);
    return res;
  } catch (e) {
    console.error('CATCHED ERROR:', e);
    if (e instanceof Error && e.stack) console.error('CATCHED ERROR outer stack:', e.stack);
    const name = e instanceof Error ? e.name : '';
    const msg = e instanceof Error ? e.message : String(e);
    console.error('GitHub fetch failed', label, name, msg);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function githubErrorMessage(e: unknown): string {
  if (e instanceof Error && e.name === 'AbortError') {
    return `GitHub request timed out after ${GITHUB_FETCH_TIMEOUT_MS / 1000}s`;
  }
  return e instanceof Error ? e.message : String(e);
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    for (let j = 0; j < sub.length; j++) {
      binary += String.fromCharCode(sub[j]!);
    }
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const githubHeaders = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

async function logGithubFullError(res: Response, context: string): Promise<string> {
  const body = await res.text();
  console.error('GITHUB FULL ERROR:', context, 'status=', res.status, 'body=', body);
  return body;
}

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
    return base64ToUtf8(data.content);
  }
  if (typeof data.download_url === 'string' && data.download_url.length > 0) {
    const raw = await githubFetch(`GET download_url ${owner}/${repo}/${filePath}`, data.download_url, {
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
  const getRes = await githubFetch(
    `GET dest sha ${destOwner}/${destRepo}/${filePath}@${destBranch}`,
    `${apiBase}?ref=${encodeURIComponent(destBranch)}`,
    { headers: githubHeaders(token) },
  );

  let sha: string | undefined;
  if (getRes.ok) {
    const meta = (await getRes.json()) as { sha?: string };
    sha = typeof meta.sha === 'string' ? meta.sha : undefined;
  } else if (getRes.status !== 404) {
    const errText = await logGithubFullError(getRes, `GET dest sha ${destOwner}/${destRepo}/${filePath}`);
    return { ok: false, error: `GET dest ${filePath}: ${getRes.status} ${errText.slice(0, 400)}` };
  }

  const b64 = utf8ToBase64(text);
  const putBody: Record<string, string> = {
    message,
    content: b64,
    branch: destBranch,
  };
  if (sha) putBody.sha = sha;

  const putRes = await githubFetch(`PUT dest ${destOwner}/${destRepo}/${filePath}`, apiBase, {
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
  const rawGithubToken = Deno.env.get('GITHUB_TOKEN');
  const token = rawGithubToken?.trim();
  console.log('Token check:', token ? 'Exists (starts with ' + token.slice(0, 4) + ')' : 'MISSING');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    if (!TEMP_SKIP_JWT_USER_CHECK) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!jwt) {
        const body = {
          ok: false,
          error: 'missing_authorization',
          message: 'Missing Authorization Bearer token',
          hint: 'Send header Authorization: Bearer <user_jwt> from supabase.auth.getSession().access_token',
        };
        return new Response(JSON.stringify(body), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('DIAG: before createClient (admin)');
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      console.log('DIAG: before admin.auth.getUser(jwt)');
      const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
      console.log('DIAG: after admin.auth.getUser', { ok: !userErr, hasEmail: !!userData?.user?.email });
      if (userErr) {
        console.error('AUTH ERROR DETAILS:', userErr);
        const authBody = {
          ok: false,
          error: 'auth_get_user_failed',
          message: userErr.message ?? 'getUser failed',
          code: (userErr as { code?: string }).code ?? null,
          status: (userErr as { status?: number }).status ?? null,
          name: (userErr as { name?: string }).name ?? null,
        };
        return new Response(JSON.stringify(authBody), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const email = userData?.user?.email?.trim().toLowerCase() ?? '';
      if (!email) {
        const body = {
          ok: false,
          error: 'no_email_on_user',
          message: 'JWT valid but user has no email on record',
          user_id: userData?.user?.id ?? null,
        };
        console.error('AUTH ERROR DETAILS: missing email on user', body);
        return new Response(JSON.stringify(body), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      /** אבטחה לוגית בתוך הקוד: רק המייל המורשה יכול לפרסם. */
      if (email !== 'malachiroei@gmail.com') {
        return new Response(JSON.stringify({ error: 'unauthorized_user', got_email: email }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.warn(
        'TEMP_SKIP_JWT_USER_CHECK=true: JWT user checks disabled — restore before production + deploy without --no-verify-jwt',
      );
    }

    let body: { snapshot?: Record<string, unknown> };
    try {
      console.log('DIAG: before req.json()');
      body = await req.json();
      console.log('DIAG: after req.json()');
    } catch (jsonErr) {
      console.error('req.json() failed:', jsonErr);
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { snapshot } = body;
    const featuresList = Array.isArray(snapshot?.features) ? snapshot.features : [];
    console.log('Files to publish:', featuresList.length || 0);
    if (featuresList.length === 0) {
      console.warn('WARNING: No features selected for publishing.');
    }
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

    const owner = GITHUB_DEST_OWNER;
    const name = GITHUB_DEST_REPO;
    console.log('GitHub publish destination repo:', GITHUB_DEST_FULL);
    if (`${owner}/${name}` !== GITHUB_DEST_FULL) {
      console.error('CRITICAL: destination repo string mismatch', `${owner}/${name}`, 'expected', GITHUB_DEST_FULL);
    }
    const branch = Deno.env.get('GITHUB_BRANCH')?.trim() || 'master';
    const path = Deno.env.get('GITHUB_VERSION_SNAPSHOT_PATH')?.trim() || DEFAULT_PATH;

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
      const msg = githubErrorMessage(error);
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
      const getRes = await githubFetch(
        `GET snapshot ${owner}/${name}/${path}@${branch}`,
        `${apiBase}?ref=${encodeURIComponent(branch)}`,
        { headers: githubHeaders(token) },
      );

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
      const b64 = utf8ToBase64(text);
      const putBody: Record<string, string> = {
        message: `chore(release): version_snapshot ${version}`,
        content: b64,
        branch,
      };
      if (sha) putBody.sha = sha;

      const putRes = await githubFetch(`PUT snapshot ${owner}/${name}/${path}`, apiBase, {
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
      const detail = githubErrorMessage(error);
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
