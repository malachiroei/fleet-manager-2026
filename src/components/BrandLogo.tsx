import { getSupabaseUrl } from '@/integrations/supabase/publicEnv';

/**
 * ברירת מחדל fallback — `public/car.png`; בפריסה עם Supabase משתמשים באותו `logos/logo.jpg` כמו במיילים.
 */
export function getBrandLogoUrl(): string {
  const base = String(getSupabaseUrl() ?? '').trim().replace(/\/+$/, '');
  if (base) return `${base}/storage/v1/object/public/logos/logo.jpg`;
  return '/car.png';
}

const wrapBase =
  'shrink-0 bg-[#0a1525] rounded-xl overflow-hidden flex items-center justify-center';

const imgBase =
  'h-full w-full object-contain object-center scale-[2.1] transform origin-center';

type BrandLogoSize = 'sidebar' | 'header';

const sizeClasses: Record<BrandLogoSize, { wrap: string }> = {
  /** Sidebar / mobile sheet – tall enough so scaled car fills box */
  sidebar: { wrap: `${wrapBase} h-16 w-28 p-1.5` },
  /** AppLayout desktop/mobile header */
  header: { wrap: `${wrapBase} h-16 w-24 p-1.5` },
};

interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
}

export function BrandLogo({ size = 'header', className = '' }: BrandLogoProps) {
  const { wrap } = sizeClasses[size];
  return (
    <div className={`${wrap} ${className}`.trim()}>
      <img src={getBrandLogoUrl()} alt="" className={imgBase} aria-hidden />
    </div>
  );
}

export { wrapBase as brandLogoWrapBase, imgBase as brandLogoImgBase };
