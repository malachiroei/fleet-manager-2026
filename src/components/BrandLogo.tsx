/**
 * Brand logo – same asset as og:image (public/og-image.png).
 * Deep blue box + scaled img so the white car fills the area (matches AppLayout header).
 */
const appLogo = '/og-image.png';

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
      <img src={appLogo} alt="" className={imgBase} aria-hidden />
    </div>
  );
}

export { appLogo, wrapBase as brandLogoWrapBase, imgBase as brandLogoImgBase };
