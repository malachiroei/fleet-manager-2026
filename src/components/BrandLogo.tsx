/**
 * Brand logo (Supabase Storage public bucket: logos).
 * Centralized so header/auth screens use the same asset.
 */
import { fleetPublicStorageObjectUrl } from '@/lib/supabase/fleetPublicStorageUrl';

export function getBrandLogoUrl(): string {
  return fleetPublicStorageObjectUrl('logos/logo.jpg');
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
