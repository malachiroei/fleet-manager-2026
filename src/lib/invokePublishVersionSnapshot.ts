import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { VersionSnapshotFile } from '@/lib/versionSnapshotTypes';

export type PublishVersionSnapshotResponse = {
  ok: true;
  github: { path: string; branch: string; commit_sha: string | null };
  production: Record<string, unknown>;
};

/** פרסום גרסה — הנתיב שמעדכן את ריפו הפרודקשן (GitHub API; ענף master לפי סודות publish-version-snapshot). */
export async function invokePublishVersionSnapshot(
  snapshot: VersionSnapshotFile
): Promise<PublishVersionSnapshotResponse> {
  const { data, error } = await supabase.functions.invoke('publish-version-snapshot', {
    body: { snapshot },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const j = (await error.context.json()) as { error?: string };
        throw new Error(j.error ?? error.message);
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
