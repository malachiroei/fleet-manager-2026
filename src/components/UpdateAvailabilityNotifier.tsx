import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { version as bundledVersion } from '@/constants/version';
import { updateAppFromTestDeploy } from '@/lib/testDeployUpdate';
import {
  skipWaitingFromUserAction,
  subscribeToServiceWorkerUpdate,
} from '@/lib/registerServiceWorker';
import { supabase } from '@/integrations/supabase/client';
import {
  compareSemver,
  fetchVersionManifestFromDb,
  fetchVersionManifestFromUrl,
  getTestStaticManifestUrl,
  isFleetManagerProHostname,
} from '@/lib/versionManifest';

/**
 * בודק מול v-dev-only.json בטסט ומול עדכון SW — ללא רענון אוטומטי.
 * המשתמש רואה באנר ומחליט מתי ללחוץ "עדכן עכשיו".
 */
export function UpdateAvailabilityNotifier() {
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [fromManifest, setFromManifest] = useState(false);
  const [fromSw, setFromSw] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const checkManifest = useCallback(async () => {
    if (typeof window !== 'undefined' && isFleetManagerProHostname()) return;
    try {
      const fromDb = await fetchVersionManifestFromDb(supabase as any);
      const fromUrl = await fetchVersionManifestFromUrl(getTestStaticManifestUrl());
      const candidates: { version: string }[] = [];
      if (fromDb?.version) candidates.push({ version: String(fromDb.version) });
      if (fromUrl?.version) candidates.push({ version: String(fromUrl.version) });
      let latest = '';
      for (const c of candidates) {
        if (!c.version.trim()) continue;
        if (!latest || compareSemver(c.version, latest) > 0) latest = c.version.trim();
      }
      if (!latest) return;
      if (compareSemver(latest, bundledVersion) > 0) {
        setRemoteVersion(latest);
        setFromManifest(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void checkManifest();
    const onFocus = () => void checkManifest();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkManifest]);

  useEffect(() => {
    return subscribeToServiceWorkerUpdate(() => {
      setFromSw(true);
    });
  }, []);

  const visible = (fromManifest || fromSw) && !dismissing;
  const targetVersion = remoteVersion;

  const dismissKey = `update-banner-dismissed-${targetVersion ?? 'sw'}-${fromManifest ? 'm' : ''}${fromSw ? 's' : ''}`;
  useEffect(() => {
    try {
      if (sessionStorage.getItem(dismissKey) === '1') {
        setDismissing(true);
      }
    } catch {
      // ignore
    }
  }, [dismissKey]);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(dismissKey, '1');
    } catch {
      // ignore
    }
    setDismissing(true);
  };

  const handleUpdateNow = async () => {
    try {
      await skipWaitingFromUserAction();
    } catch {
      // ignore
    }
    await updateAppFromTestDeploy();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-14 left-0 right-0 z-[100000] border-t border-cyan-500/40 bg-[#0f172a]/98 px-4 py-3 text-center shadow-lg backdrop-blur-sm sm:bottom-10"
      role="status"
    >
      <p className="mb-2 text-sm text-white">
        {fromManifest && targetVersion && (
          <>
            מניפסט הטסט מדווח על גרסה <strong className="text-cyan-300">v{targetVersion}</strong> (מותקנת אצלך: v
            {bundledVersion}).{' '}
          </>
        )}
        {fromSw && (
          <span>
            נמצא Service Worker מעודכן — לא מוחל אוטומטית. בחר אם לעדכן עכשיו.
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500" onClick={() => void handleUpdateNow()}>
          עדכן עכשיו
        </Button>
        <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10" onClick={handleDismiss}>
          לא עכשיו
        </Button>
      </div>
    </div>
  );
}
