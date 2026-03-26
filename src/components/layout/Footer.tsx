import type { FC } from 'react';

type FooterVariant = 'test' | 'source' | 'hidden';

function resolveFooterVariant(): FooterVariant {
  const appStatus = String(import.meta.env.VITE_APP_STATUS ?? '').toLowerCase();

  // Prefer explicit app status when available
  if (appStatus === 'test') return 'test';
  if (appStatus === 'prod' || appStatus === 'production') return 'source';
  if (appStatus === 'staging' || appStatus === 'development' || appStatus === 'dev' || appStatus === 'local') {
    return 'hidden';
  }

  // Fallback to deploy target if provided
  const envTarget = String(import.meta.env.VITE_DEPLOY_TARGET ?? '').toLowerCase();
  if (envTarget === 'test') return 'test';
  if (envTarget === 'source' || envTarget === 'prod' || envTarget === 'production') return 'source';

  // Fallback to hostname heuristics
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === 'manager-2026-test.vercel.app' || hostname.includes('manager-2026-test')) {
    return 'test';
  }
  if (hostname === 'fleet-manager-pro.com' || hostname.includes('fleet-manager-pro')) {
    return 'source';
  }

  // Default to hiding when environment is unknown
  return 'hidden';
}

const Footer: FC = () => {
  const variant = resolveFooterVariant();
  const isTest = variant === 'test';

  if (variant === 'hidden') {
    return null;
  }

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-[99999] py-0.5 text-center text-xs font-bold tracking-widest text-white ${
        isTest ? 'bg-emerald-500' : 'bg-red-600'
      }`}
    >
      <div className="leading-tight">
        {isTest ? 'גרסת טסט' : 'גרסת מקור'}
      </div>
    </footer>
  );
};

export default Footer;
