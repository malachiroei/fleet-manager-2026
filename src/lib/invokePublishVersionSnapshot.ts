import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  getSupabaseAnonKey,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from '@/integrations/supabase/publicEnv';
import type { VersionSnapshotFile } from '@/lib/versionSnapshotTypes';

function anonKeyForFunctions(): string {
  return getSupabaseAnonKey() || getSupabasePublishableKey() || '';
}

/** חייב להתאים ל־Edge Functions ב־Supabase Dashboard (אותו פרויקט כמו VITE/NEXT_PUBLIC_SUPABASE_URL). */
function publishVersionSnapshotFunctionUrl(): string {
  const base = getSupabaseUrl().replace(/\/+$/, '');
  return `${base}/functions/v1/publish-version-snapshot`;
}

export type PublishVersionSnapshotResponse = {
  ok: true;
  github: { path: string; branch: string; commit_sha: string | null };
  dependencies_sync?: Record<string, unknown>;
  production: Record<string, unknown>;
};

/**
 * פרסום גרסה — Edge Function `publish-version-snapshot`.
 * (אין `InvokePublishButton.tsx`; הקריאה מגיעה מ־`PublishVersionDetailedDialog` וכו׳.)
 *
 * דורש JWT של המשתמש ב־Authorization; שער Supabase דורש גם `apikey` (כמו ב־`send-invite`).
 */
export async function invokePublishVersionSnapshot(
  snapshot: VersionSnapshotFile,
): Promise<PublishVersionSnapshotResponse> {
  const anon = anonKeyForFunctions();
  if (!anon) {
    throw new Error('Missing Supabase anon key — cannot invoke publish-version-snapshot');
  }

  // Ensure we read the freshest session before invoking (publish is rare; extra call is acceptable).
  try {
    await supabase.auth.refreshSession();
  } catch {
    // ignore — if refresh fails we'll still try getSession and handle missing token
  }

  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    await supabase.auth.refreshSession();
    ({
      data: { session },
    } = await supabase.auth.getSession());
  }

  if (!session?.access_token) {
    throw new Error('Not signed in — cannot publish (missing JWT for Authorization)');
  }

  const functionUrl = publishVersionSnapshotFunctionUrl();
  const featureCount = snapshot.features?.length ?? 0;
  const featureIdsPreview = (snapshot.features ?? []).slice(0, 12).map((f) => f.id);
  console.log('Sending request to function...');
  console.log('publish-version-snapshot endpoint (must match Dashboard):', functionUrl);
  console.log('Sending Token:', session?.access_token ? 'YES' : 'NO');
  console.log(
    '[invokePublishVersionSnapshot] body.snapshot.features count:',
    featureCount,
    'sample ids:',
    featureIdsPreview,
  );

  const { data, error } = await supabase.functions.invoke('publish-version-snapshot', {
    body: { snapshot },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = (error as unknown as { context?: { status?: number } }).context?.status;
      if (status === 401) {
        throw new Error('סשן פג תוקף - נא לבצע התחברות מחדש');
      }
      try {
        const j = (await error.context.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          code?: string;
          hint?: string;
          allowed_email?: string;
          got_email?: string;
        };
        const parts = [
          j.message,
          j.error,
          j.code,
          j.hint,
          j.got_email && j.allowed_email ? `מייל: ${j.got_email} (מורשה: ${j.allowed_email})` : null,
        ].filter(Boolean);
        throw new Error(parts.length > 0 ? parts.join(' — ') : error.message);
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e;
        throw new Error(error.message);
      }
    }
    throw error;
  }
  const d = data as { ok?: boolean; error?: string };
  if (!d || d.ok !== true) {
    throw new Error(d?.error ?? 'publish-version-snapshot failed');
  }
  return data as PublishVersionSnapshotResponse;
}
