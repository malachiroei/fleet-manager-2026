import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { version as bundledVersion } from '@/constants/version';
import { updateAppFromTestDeploy } from '@/lib/testDeployUpdate';
import {
  skipWaitingFromUserAction,
  subscribeToServiceWorkerUpdate,
} from '@/lib/registerServiceWorker';

const VERSION_MANIFEST_URL = 'https://fleet-manager-dev.vercel.app/v.json';

function parseSemver(v: string): number[] | null {
  const parts = String(v).split('.').map((x) => parseInt(x, 10));
  if (parts.length < 3) return null;
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.slice(0, 3);
}

/** חיובי אם a גדול מ-b */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * בודק מול v.json בטסט ומול עדכון SW — ללא רענון אוטומטי.
 * המשתמש רואה באנר ומחליט מתי ללחוץ "עדכן עכשיו".
 */
export function UpdateAvailabilityNotifier() {
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [fromManifest, setFromManifest] = useState(false);
  const [fromSw, setFromSw] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const checkManifest = useCallback(async () => {
    try {
      const res = await fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const manifest = (await res.json()) as { version?: unknown };
      const latest = typeof manifest.version === 'string' ? manifest.version.trim() : '';
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
