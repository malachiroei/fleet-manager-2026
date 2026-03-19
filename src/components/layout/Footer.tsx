import type { FC } from 'react';

type FooterVariant = 'test' | 'source' | null;

function resolveFooterVariant(): FooterVariant {
  const hostname = window.location.hostname.toLowerCase();
  const envTarget = String(import.meta.env.VITE_DEPLOY_TARGET ?? '').toLowerCase();

  if (envTarget === 'test') return 'test';
  if (hostname === 'manager-2026-test.vercel.app' || hostname.includes('manager-2026-test')) {
    return 'test';
  }

  /** באנר אדום "גרסת מקור" — רק בדומיין המדויק (לא apex, לא Vercel preview) */
  if (hostname === 'www.fleet-manager-pro.com') {
    return 'source';
  }

  return null;
}

const Footer: FC = () => {
  const variant = resolveFooterVariant();
  if (variant === null) return null;

  const isTest = variant === 'test';

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-[99999] py-0.5 text-center text-xs font-bold tracking-widest text-white ${
        isTest ? 'bg-emerald-500' : 'bg-red-600'
      }`}
    >
      {isTest ? 'גרסת טסט' : 'גרסת מקור'}
    </footer>
  );
};

export default Footer;
