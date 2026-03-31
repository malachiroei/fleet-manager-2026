import type { FC } from 'react';

type FooterVariant = 'test' | 'source' | 'hidden';

function resolveFooterVariant(): FooterVariant {
  const appStatus = String(import.meta.env.VITE_APP_STATUS ?? '').toLowerCase();

  if (appStatus === 'test') return 'test';
  if (appStatus === 'prod' || appStatus === 'production') return 'source';
  if (appStatus === 'staging' || appStatus === 'development' || appStatus === 'dev' || appStatus === 'local') {
    return 'hidden';
  }

  const envTarget = String(import.meta.env.VITE_DEPLOY_TARGET ?? '').toLowerCase();
  if (envTarget === 'test') return 'test';
  if (envTarget === 'source' || envTarget === 'prod' || envTarget === 'production') return 'source';

  const hostname = window.location.hostname.toLowerCase();
  if (hostname === 'manager-2026-test.vercel.app' || hostname.includes('manager-2026-test')) {
    return 'test';
  }
  if (hostname === 'fleet-manager-pro.com' || hostname.includes('fleet-manager-pro')) {
    return 'source';
  }

  return 'hidden';
}

const Footer: FC = () => {
  const variant = resolveFooterVariant();
  const isTest = variant === 'test';

  if (variant === 'hidden') {
    return null;
  }

  /** פס תחתון דק כמו באנר staging — לא תופס גובה מיותר */
  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-[99999] flex h-6 min-h-[1.5rem] items-center justify-center border-t border-black/10 px-2 py-0 text-center ${
        isTest ? 'bg-emerald-600' : 'bg-red-600'
      }`}
    >
      <span className="text-[10px] font-semibold leading-none tracking-wide text-white sm:text-[11px]">
        {isTest ? 'גרסת טסט' : 'מערכת בניהול'}
      </span>
    </footer>
  );
};

export default Footer;
