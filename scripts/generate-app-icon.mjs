import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

/**
 * Build-time asset generator for Vercel/PWA:
 * - public/og-image.png (favicon + og/twitter cards in index.html)
 * - public/app-icon-192.png + public/app-icon-512.png + public/site.webmanifest
 *
 * Source: explicit brand car in `public/` (same visual as login/header via car asset).
 * Do not rely on "first JPG" — there is often none, which produced solid blue squares.
 */
const OUTPUT_NAMES = new Set(
  ['og-image.png', 'app-icon-192.png', 'app-icon-512.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png', 'apple-touch-icon.png'].map(
    (n) => n.toLowerCase()
  )
);

async function resolveSourcePath(publicDir, files) {
  const byLower = new Map(files.map((f) => [f.toLowerCase(), f]));
  const prefer = ['car.png', 'carnew.png'];
  for (const name of prefer) {
    const actual = byLower.get(name.toLowerCase());
    if (!actual) continue;
    const p = path.join(publicDir, actual);
    try {
      await fs.access(p);
      return p;
    } catch {
      // continue
    }
  }
  const jpgs = files.filter((f) => /\.jpe?g$/i.test(f));
  if (jpgs.length) return path.join(publicDir, [...jpgs].sort()[0]);
  const pngs = files.filter(
    (f) => f.toLowerCase().endsWith('.png') && !OUTPUT_NAMES.has(f.toLowerCase())
  );
  if (pngs.length) return path.join(publicDir, [...pngs].sort()[0]);
  return null;
}

async function main() {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, 'public');

  const files = await fs.readdir(publicDir).catch(() => []);
  const sourcePath = await resolveSourcePath(publicDir, files);

  /** עקבי עם theme-color ב-index.html — רקע כהה בטעינת PWA/כרום (לא כחול) */
  const themeColor = '#02040a';

  const outOg = path.join(publicDir, 'og-image.png');
  const out192 = path.join(publicDir, 'app-icon-192.png');
  const out512 = path.join(publicDir, 'app-icon-512.png');
  const outManifest = path.join(publicDir, 'site.webmanifest');

  // Ensure outputs are always created so the build can’t fail on missing assets.
  if (sourcePath) {
    await sharp(sourcePath).resize(1200, 630, { fit: 'cover', position: 'centre' }).png().toFile(outOg);
    await sharp(sourcePath).resize(192, 192, { fit: 'cover', position: 'centre' }).png().toFile(out192);
    await sharp(sourcePath).resize(512, 512, { fit: 'cover', position: 'centre' }).png().toFile(out512);
  } else {
    await sharp({
      create: { width: 1200, height: 630, channels: 4, background: themeColor },
    })
      .png()
      .toFile(outOg);
    await sharp({
      create: { width: 192, height: 192, channels: 4, background: themeColor },
    })
      .png()
      .toFile(out192);
    await sharp({
      create: { width: 512, height: 512, channels: 4, background: themeColor },
    })
      .png()
      .toFile(out512);
  }

  const manifest = {
    name: 'Fleet Manager Pro',
    short_name: 'Fleet',
    start_url: '/',
    display: 'standalone',
    background_color: themeColor,
    theme_color: themeColor,
    icons: [
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };

  await fs.writeFile(outManifest, JSON.stringify(manifest, null, 2), 'utf8');
}

main().catch((err) => {
  // Do not hard-fail the build on icon generation; Vite should still be able to run.
  // Still log the error so CI/build logs contain the reason.
  console.error('[generate-app-icon] failed:', err);
  process.exitCode = 1;
});

