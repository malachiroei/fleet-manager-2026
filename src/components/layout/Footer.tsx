import type { FC } from 'react';

type FooterVariant = 'test' | 'source';

function resolveFooterVariant(): FooterVariant {
  const envTarget = String(import.meta.env.VITE_DEPLOY_TARGET ?? '').toLowerCase();
  if (envTarget === 'test') return 'test';
  if (envTarget === 'source' || envTarget === 'prod' || envTarget === 'production') return 'source';

  const hostname = window.location.hostname.toLowerCase();
  if (hostname === 'manager-2026-test.vercel.app' || hostname.includes('manager-2026-test')) {
    return 'test';
  }
  if (hostname === 'fleet-manager-2026.vercel.app' || hostname.includes('fleet-manager-2026')) {
    return 'source';
  }
  return 'source';
}

const Footer: FC = () => {
  const variant = resolveFooterVariant();
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
