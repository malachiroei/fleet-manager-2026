import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { ANDROID_WEBCAM_WARMUP_POST_STOP_MS, tryMaterializeImageFileFromInput } from '@/lib/mobilePhotoIngest';

type WebcamCaptureProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
  disabled?: boolean;
};

const WEBCAM_PROFILE_STORAGE_KEY = 'fleet_manager_mileage_webcam_profile_v1';
const REAR_DEVICE_ID_STORAGE_KEY = 'fleet_manager_mileage_rear_device_id_v1';

/** Re-probe after first warm-up reboot before optional second hard reset (allow attach + decode). */
const POST_FIRST_WARMUP_RECHECK_MS = 2200;

/** After the first front stream is live on Android, auto-switch to rear (no manual tap). */
const ANDROID_AUTO_FLIP_TO_REAR_MS = 500;

type CameraProfile = 'environment' | 'user' | 'compatible';

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

function isAndroidUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

function readStoredCameraProfile(): CameraProfile | null {
  try {
    const v = localStorage.getItem(WEBCAM_PROFILE_STORAGE_KEY);
    if (v === 'environment' || v === 'user' || v === 'compatible') return v;
  } catch {
    /* private mode */
  }
  return null;
}

function writeStoredCameraProfile(profile: CameraProfile): void {
  try {
    localStorage.setItem(WEBCAM_PROFILE_STORAGE_KEY, profile);
  } catch {
    /* ignore */
  }
}

function readStoredRearDeviceId(): string | null {
  try {
    const id = localStorage.getItem(REAR_DEVICE_ID_STORAGE_KEY)?.trim();
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function writeStoredRearDeviceId(deviceId: string): void {
  try {
    localStorage.setItem(REAR_DEVICE_ID_STORAGE_KEY, deviceId);
  } catch {
    /* ignore */
  }
}

function maybePersistRearDeviceId(stream: MediaStream | null): void {
  const track = stream?.getVideoTracks()[0];
  const id = track?.getSettings?.().deviceId;
  if (id) writeStoredRearDeviceId(id);
}

const PERMISSION_BLOCKED_HE =
  'נראה שהרשאת המצלמה חסומה. אנא אפשר גישה למצלמה בהגדרות הדפדפן.';

function mapGetUserMediaError(err: unknown): string {
  const dom = err as DOMException | undefined;
  const name = dom?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return PERMISSION_BLOCKED_HE;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'לא נמצאה מצלמה במכשיר.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'המצלמה לא זמינה (אולי בשימוש אפליקציה אחרת).';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'הגדרות המצלמה לא נתמכות — נסו שוב.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'לא ניתן לפתוח את המצלמה.';
}

/** exact environment first, then ideal, then persisted rear deviceId, then generic fallback. */
function buildEnvironmentConstraintChain(storedRearDeviceId: string | null): MediaStreamConstraints[] {
  const exactEnv: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    { video: { facingMode: { exact: 'environment' } }, audio: false },
  ];
  const deviceIdChain: MediaStreamConstraints[] = storedRearDeviceId
    ? [
        {
          video: {
            deviceId: { exact: storedRearDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        {
          video: {
            deviceId: { exact: storedRearDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        { video: { deviceId: { exact: storedRearDeviceId } }, audio: false },
      ]
    : [];
  const idealEnv: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: { facingMode: 'environment' }, audio: false },
  ];
  return [...exactEnv, ...deviceIdChain, ...idealEnv, { video: true, audio: false }];
}

const USER_CONSTRAINT_CHAIN: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  { video: { facingMode: { ideal: 'user' } }, audio: false },
  { video: { facingMode: 'user' }, audio: false },
  { video: true, audio: false },
];

const HIGH_COMPAT_CONSTRAINT_CHAIN: MediaStreamConstraints[] = [{ video: true, audio: false }];

const QUICK_USER_WARMUP: MediaStreamConstraints[] = [
  { video: { facingMode: { ideal: 'user' } }, audio: false },
  { video: { facingMode: 'user' }, audio: false },
];

function constraintChainForProfile(profile: CameraProfile): MediaStreamConstraints[] {
  switch (profile) {
    case 'user':
      return USER_CONSTRAINT_CHAIN;
    case 'compatible':
      return HIGH_COMPAT_CONSTRAINT_CHAIN;
    default:
      return buildEnvironmentConstraintChain(readStoredRearDeviceId());
  }
}

async function getUserMediaWithChain(chain: MediaStreamConstraints[]): Promise<MediaStream> {
  let lastErr: unknown;
  for (const constraints of chain) {
    try {
      return await navigator.mediaDevices!.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Sample decoded frame — rear camera can look black in the compositor but still decode here. */
function probeVideoFrameOnCanvas(video: HTMLVideoElement): { ok: boolean; avgLuma: number } {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w <= 0 || h <= 0) {
    return { ok: false, avgLuma: 0 };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { ok: false, avgLuma: 0 };
  }
  try {
    ctx.drawImage(video, 0, 0, w, h);
  } catch {
    return { ok: false, avgLuma: 0 };
  }
  const sw = Math.min(64, w);
  const sh = Math.min(64, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, sw, sh);
  } catch {
    return { ok: false, avgLuma: 0 };
  }
  let sum = 0;
  const n = data.data.length / 4;
  for (let i = 0; i < data.data.length; i += 4) {
    sum += data.data[i]! + data.data[i + 1]! + data.data[i + 2]!;
  }
  const avgLuma = n > 0 ? sum / n / 3 : 0;
  return { ok: avgLuma > 6, avgLuma };
}

export function WebcamCapture({ open, onOpenChange, onCapture, disabled }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const [cameraProfile, setCameraProfile] = useState<CameraProfile>(() => {
    /** Android: start on front — rear often shows black until the front camera was opened in this session. */
    if (isAndroidUa()) {
      return 'user';
    }
    const saved = readStoredCameraProfile();
    if (saved === 'compatible') return 'environment';
    return saved ?? 'environment';
  });
  const cameraProfileRef = useRef(cameraProfile);
  cameraProfileRef.current = cameraProfile;

  const [streamBootId, setStreamBootId] = useState(0);
  const rearWarmupDoneRef = useRef(false);
  const rearHardResetDoneRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [canvasProbeOk, setCanvasProbeOk] = useState(false);
  /** Reactive gate: refs don't re-render when video dimensions appear. */
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  /** Android: keep loader until rear is usable (covers silent front + flip + rear attach). */
  const [androidRearBootstrapping, setAndroidRearBootstrapping] = useState(false);
  const androidRearBootstrappingRef = useRef(false);

  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidAutoFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAndroidAutoFlipTimer = useCallback(() => {
    if (androidAutoFlipTimerRef.current) {
      clearTimeout(androidAutoFlipTimerRef.current);
      androidAutoFlipTimerRef.current = null;
    }
  }, []);

  const clearInitTimeout = useCallback(() => {
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
  }, []);

  const markVideoPresenting = useCallback(() => {
    clearInitTimeout();
    if (!openRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    /** During Android auto front→rear, hide preview under the loader until we switch to rear. */
    if (androidRearBootstrappingRef.current && cameraProfileRef.current === 'user') {
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setHasVideoFrame(true);
        setVideoReady(true);
      }
      return;
    }
    setLoading(false);
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setHasVideoFrame(true);
      setVideoReady(true);
    }
  }, [clearInitTimeout]);

  useEffect(() => {
    if (!open) return;
    if (isAndroidUa()) {
      setCameraProfile('user');
      return;
    }
    const saved = readStoredCameraProfile();
    if (saved === 'compatible') {
      setCameraProfile('environment');
    } else if (saved) {
      setCameraProfile(saved);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && v.videoWidth > 0 && v.videoHeight > 0) {
        setHasVideoFrame(true);
      }
    }, 1200);
    return () => clearInterval(id);
  }, [open]);

  const attachStream = useCallback(async () => {
    setError(null);
    setVideoReady(false);
    setCanvasProbeOk(false);
    setHasVideoFrame(false);
    setLoading(true);
    clearInitTimeout();
    stopStream(streamRef.current);
    streamRef.current = null;

    const video = videoRef.current;
    if (!video) {
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      clearAndroidAutoFlipTimer();
      setLoading(false);
      return;
    }
    video.srcObject = null;

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      clearAndroidAutoFlipTimer();
      setError('האתר חייב לרוץ תחת HTTPS כדי שהמצלמה תעבוד.');
      setLoading(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      clearAndroidAutoFlipTimer();
      setError('הדפדפן לא תומך במצלמה (נדרש HTTPS ודפדפן מעודכן).');
      setLoading(false);
      return;
    }

    let stream: MediaStream | null = null;
    try {
      /**
       * Android + rear: never open the back camera first on a fresh modal attach (`streamBootId === 0`).
       * Always run a silent front pulse + delay first (same idea as a dedicated WebcamCapture instance per slot on delivery).
       * Internal warm-up reboots increment `streamBootId` and skip this so we do not stack delays.
       */
      if (isAndroidUa() && cameraProfileRef.current === 'environment' && streamBootId === 0) {
        try {
          const unlock = await getUserMediaWithChain(QUICK_USER_WARMUP);
          stopStream(unlock);
        } catch {
          /* still attempt rear */
        }
        await new Promise((r) => setTimeout(r, ANDROID_WEBCAM_WARMUP_POST_STOP_MS));
        if (!openRef.current) return;
      }
      stream = await getUserMediaWithChain(constraintChainForProfile(cameraProfileRef.current));
    } catch (err) {
      if (!openRef.current) return;
      clearAndroidAutoFlipTimer();
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      setError(mapGetUserMediaError(err));
      setLoading(false);
      return;
    }

    if (!openRef.current) {
      stopStream(stream);
      return;
    }

    const openedProfile = cameraProfileRef.current;

    stream.getTracks().forEach((track) => {
      track.enabled = true;
    });

    streamRef.current = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;

    const [vTrack] = stream.getVideoTracks();
    if (vTrack) {
      vTrack.addEventListener('unmute', () => markVideoPresenting());
      vTrack.addEventListener('ended', () => {
        if (openRef.current) setError('המצלמה נותקה. נסו שוב.');
      });
      if (!vTrack.muted) {
        requestAnimationFrame(() => markVideoPresenting());
      }
    }

    initTimeoutRef.current = setTimeout(() => {
      initTimeoutRef.current = null;
      if (!openRef.current) return;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        markVideoPresenting();
        return;
      }
      clearAndroidAutoFlipTimer();
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      setLoading(false);
      setError(
        'המצלמה איטית או לא מציגה תמונה. בדקו הרשאות, או סגרו ונסו שוב. אם הרשאה חסומה — אפשרו מצלמה בהגדרות הדפדפן.'
      );
    }, 12000);

    try {
      await video.play();
      requestAnimationFrame(() => markVideoPresenting());
      const rVfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void })
        .requestVideoFrameCallback;
      if (typeof rVfc === 'function') {
        rVfc.call(video, () => markVideoPresenting());
      }
    } catch {
      clearInitTimeout();
      clearAndroidAutoFlipTimer();
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      if (!openRef.current) {
        stopStream(stream);
        streamRef.current = null;
        return;
      }
      setError('לא ניתן להפעיל את תצוגת המצלמה. ' + PERMISSION_BLOCKED_HE);
      stopStream(stream);
      streamRef.current = null;
      setLoading(false);
      return;
    }

    if (!openRef.current) {
      clearInitTimeout();
      stopStream(stream);
      streamRef.current = null;
      if (video) video.srcObject = null;
      return;
    }

    if (openRef.current && isAndroidUa() && openedProfile === 'user' && streamBootId === 0) {
      clearAndroidAutoFlipTimer();
      androidRearBootstrappingRef.current = true;
      setAndroidRearBootstrapping(true);
      androidAutoFlipTimerRef.current = setTimeout(() => {
        androidAutoFlipTimerRef.current = null;
        if (!openRef.current) return;
        if (cameraProfileRef.current !== 'user') return;
        setCameraProfile('environment');
      }, ANDROID_AUTO_FLIP_TO_REAR_MS);
    }

    const runCanvasProbe = () => {
      const v = videoRef.current;
      const s = streamRef.current;
      if (!v || !s || !openRef.current) return;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setHasVideoFrame(true);
      }
      const probe = probeVideoFrameOnCanvas(v);
      if (probe.ok && v.videoWidth > 0 && v.videoHeight > 0) {
        setCanvasProbeOk(true);
        setVideoReady(true);
        if (cameraProfileRef.current === 'environment') {
          maybePersistRearDeviceId(s);
        }
      }
    };
    setTimeout(runCanvasProbe, 600);
    setTimeout(runCanvasProbe, 2000);

    if (
      isAndroidUa() &&
      openedProfile === 'environment' &&
      !rearWarmupDoneRef.current &&
      navigator.mediaDevices?.getUserMedia
    ) {
      setTimeout(async () => {
        if (!openRef.current || cameraProfileRef.current !== 'environment') return;
        if (rearWarmupDoneRef.current) return;
        const v = videoRef.current;
        if (!v) return;
        const probe = probeVideoFrameOnCanvas(v);
        if (probe.ok) {
          rearWarmupDoneRef.current = true;
          if (cameraProfileRef.current === 'environment') {
            maybePersistRearDeviceId(streamRef.current);
          }
          return;
        }
        rearWarmupDoneRef.current = true;
        try {
          const wu = await getUserMediaWithChain(QUICK_USER_WARMUP);
          stopStream(wu);
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, ANDROID_WEBCAM_WARMUP_POST_STOP_MS));
        if (!openRef.current || cameraProfileRef.current !== 'environment') return;
        setStreamBootId((k) => k + 1);

        setTimeout(() => {
          if (!openRef.current || cameraProfileRef.current !== 'environment') return;
          if (!rearWarmupDoneRef.current || rearHardResetDoneRef.current) return;
          const v2 = videoRef.current;
          if (!v2) return;
          const probe2 = probeVideoFrameOnCanvas(v2);
          if (probe2.ok) return;
          rearHardResetDoneRef.current = true;
          void (async () => {
            try {
              const wu2 = await getUserMediaWithChain(QUICK_USER_WARMUP);
              stopStream(wu2);
            } catch {
              /* ignore */
            }
            await new Promise((r) => setTimeout(r, ANDROID_WEBCAM_WARMUP_POST_STOP_MS));
            if (!openRef.current || cameraProfileRef.current !== 'environment') return;
            setStreamBootId((k) => k + 1);
          })();
        }, POST_FIRST_WARMUP_RECHECK_MS);
      }, 420);
    }
  }, [cameraProfile, streamBootId, clearAndroidAutoFlipTimer, clearInitTimeout, markVideoPresenting]);

  useEffect(() => {
    if (!open) {
      clearInitTimeout();
      clearAndroidAutoFlipTimer();
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      setStreamBootId(0);
      setError(null);
      setLoading(false);
      setSnapping(false);
      setVideoReady(false);
      setCanvasProbeOk(false);
      setHasVideoFrame(false);
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    }
  }, [open, clearInitTimeout, clearAndroidAutoFlipTimer]);

  /** End Android bootstrap once rear stream is presenting (probe or ready). */
  useEffect(() => {
    if (!androidRearBootstrapping) return;
    if (!open || !isAndroidUa() || cameraProfile !== 'environment') return;
    if (hasVideoFrame && (videoReady || canvasProbeOk)) {
      androidRearBootstrappingRef.current = false;
      setAndroidRearBootstrapping(false);
      setLoading(false);
    }
  }, [
    open,
    cameraProfile,
    hasVideoFrame,
    videoReady,
    canvasProbeOk,
    androidRearBootstrapping,
  ]);

  /** Reset probe warm-up only when the dialog opens — not on `streamBootId` / profile-driven re-attach. */
  useLayoutEffect(() => {
    if (open) {
      rearWarmupDoneRef.current = false;
      rearHardResetDoneRef.current = false;
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    void attachStream();
    return () => {
      clearInitTimeout();
      clearAndroidAutoFlipTimer();
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, attachStream, clearInitTimeout, clearAndroidAutoFlipTimer]);

  useEffect(() => {
    if (!open) return;

    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      rafId = requestAnimationFrame(tick);

      const v = videoRef.current;
      const c = previewCanvasRef.current;
      if (!openRef.current || !v || !c) return;

      if (v.videoWidth <= 0 || v.videoHeight <= 0) return;

      const rect = c.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;

      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      const cw = Math.max(2, Math.floor(rect.width * dpr));
      const ch = Math.max(2, Math.floor(rect.height * dpr));

      if (c.width !== cw || c.height !== ch) {
        c.width = cw;
        c.height = ch;
      }

      const ctx = c.getContext('2d', { alpha: false });
      if (!ctx) return;

      const vw = v.videoWidth;
      const vh = v.videoHeight;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);
      const scale = Math.min(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;
      try {
        ctx.drawImage(v, 0, 0, vw, vh, dx, dy, dw, dh);
      } catch {
        /* ignore */
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, [open, cameraProfile, streamBootId]);

  const cycleCameraProfile = useCallback(() => {
    setCameraProfile((prev) => {
      /** One tap from front → rear (Android default is `user` first). */
      const order: CameraProfile[] = ['user', 'environment'];
      const normalized = prev === 'compatible' ? 'environment' : prev;
      const i = order.indexOf(normalized);
      const base = i >= 0 ? i : 0;
      return order[(base + 1) % order.length]!;
    });
  }, []);

  const finalizeDeliverCapture = useCallback(
    async (blob: Blob | null) => {
      if (!blob || blob.size < 200) {
        setError('יצירת התמונה נכשלה או שהקובץ ריק');
        return;
      }
      try {
        const name = `capture-${Date.now()}.jpg`;
        const rawFile = new File([blob], name, { type: 'image/jpeg' });
        const { file: workFile } = await tryMaterializeImageFileFromInput(rawFile);
        if (!workFile.size || workFile.size < 200) {
          setError('יצירת התמונה נכשלה או שהקובץ ריק');
          return;
        }
        writeStoredCameraProfile(cameraProfileRef.current);
        if (cameraProfileRef.current === 'environment') {
          maybePersistRearDeviceId(streamRef.current);
        }
        stopStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        onOpenChange(false);
        onCapture(workFile);
      } catch (e) {
        console.error('[WebcamCapture] finalizeDeliverCapture failed', e);
        setError('שגיאה בעיבוד התמונה');
      }
    },
    [onCapture, onOpenChange]
  );

  const handleSnap = useCallback(async () => {
    if (disabled || snapping) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const w = video?.videoWidth ?? 0;
    const h = video?.videoHeight ?? 0;
    if (w <= 0 || h <= 0) return;

    setSnapping(true);
    try {
      if (w > 0 && h > 0 && video) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
          );
          if (blob && blob.size >= 400) {
            const probe = probeVideoFrameOnCanvas(video);
            if (probe.ok || blob.size >= 2500) {
              await finalizeDeliverCapture(blob);
              return;
            }
          }
        }
      }

      const mirror = previewCanvasRef.current;
      if (mirror && mirror.width >= 2 && mirror.height >= 2) {
        const blob = await new Promise<Blob | null>((resolve) =>
          mirror.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
        );
        if (blob && blob.size >= 500) {
          await finalizeDeliverCapture(blob);
          return;
        }
      }

      if (typeof ImageCapture !== 'undefined') {
        const ic = new ImageCapture(track);
        const bitmap = await ic.grabFrame();
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bitmap.close();
          setError('יצירת התמונה נכשלה או שהקובץ ריק');
          return;
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
        );
        await finalizeDeliverCapture(blob);
        return;
      }

      setError('יצירת התמונה נכשלה או שהקובץ ריק');
    } catch (e) {
      console.error('[WebcamCapture] snap failed', e);
      setError('שגיאה בצילום');
    } finally {
      setSnapping(false);
    }
  }, [disabled, finalizeDeliverCapture, snapping]);

  const showCameraLoader = loading || androidRearBootstrapping;

  const canCapture =
    !showCameraLoader &&
    !error &&
    hasVideoFrame &&
    (videoReady || canvasProbeOk);

  const handleVideoError = useCallback(() => {
    clearInitTimeout();
    clearAndroidAutoFlipTimer();
    androidRearBootstrappingRef.current = false;
    setAndroidRearBootstrapping(false);
    if (!openRef.current) return;
    setLoading(false);
    setVideoReady(false);
    setHasVideoFrame(false);
    setError(PERMISSION_BLOCKED_HE);
    stopStream(streamRef.current);
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, [clearAndroidAutoFlipTimer, clearInitTimeout]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[51] flex items-center justify-center border-0 bg-transparent p-3 shadow-none outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:p-4"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative grid max-h-[90vh] w-full max-w-lg gap-3 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg sm:gap-4 sm:p-6">
            <DialogPrimitive.Close
              type="button"
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="סגור"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            <DialogHeader className="space-y-1 pr-8 text-right sm:text-right">
              <DialogTitle className="text-base">צילום מהמצלמה</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                המצלמה נשארת בתוך הדף — ללא מעבר לאפליקציית המערכת.
              </DialogDescription>
            </DialogHeader>

            <div className="relative aspect-[3/4] w-full min-h-[200px] overflow-hidden rounded-lg bg-black">
              {/* Mirror canvas under the video: rear stream can fail canvas drawImage while the video tag still paints. */}
              <canvas
                ref={previewCanvasRef}
                className="pointer-events-none absolute inset-0 z-0 h-full w-full"
                aria-hidden
              />
              <video
                ref={videoRef}
                className="absolute inset-0 z-[1] h-full w-full object-contain"
                playsInline
                muted
                autoPlay
                disablePictureInPicture
                disableRemotePlayback
                onLoadedMetadata={markVideoPresenting}
                onLoadedData={markVideoPresenting}
                onPlaying={markVideoPresenting}
                onCanPlay={markVideoPresenting}
                onError={handleVideoError}
              />
              {showCameraLoader && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center">
                  <Loader2 className="h-10 w-10 shrink-0 animate-spin text-white" aria-hidden />
                  <p className="text-xs text-white/90">טוען מצלמה…</p>
                </div>
              )}
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter className="flex flex-row items-center gap-2 sm:justify-end flex-row-reverse">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-12 w-12 shrink-0"
                disabled={showCameraLoader || snapping}
                onClick={cycleCameraProfile}
                aria-label="החלף מצלמה"
                title="החלף מצלמה (קדמית / אחורית)"
              >
                <RefreshCw className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                className="h-12 min-w-0 flex-1 text-base"
                onClick={() => void handleSnap()}
                disabled={disabled || showCameraLoader || !!error || !canCapture || snapping}
              >
                {snapping && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                צלם
              </Button>
            </DialogFooter>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
