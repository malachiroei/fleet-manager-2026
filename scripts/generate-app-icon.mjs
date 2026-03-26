import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

/**
 * Build-time asset generator for Vercel/PWA:
 * - public/og-image.png (used by index.html)
 * - public/app-icon-192.png + public/app-icon-512.png + public/site.webmanifest (used by vercel.json)
 *
 * The original source images in this repo can have garbled filenames, so we:
 * - pick the first JPG from `public/` as the source
 * - fall back to placeholders if none exist
 */
async function main() {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, 'public');

  const files = await fs.readdir(publicDir).catch(() => []);
  const jpgFiles = files.filter((f) => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'));
  const sourcePath = jpgFiles.length ? path.join(publicDir, jpgFiles[0]) : null;

  const themeColor = '#1e40af';

  const outOg = path.join(publicDir, 'og-image.png');
  const out192 = path.join(publicDir, 'app-icon-192.png');
  const out512 = path.join(publicDir, 'app-icon-512.png');
  const outManifest = path.join(publicDir, 'site.webmanifest');

  // Ensure outputs are always created so the build can’t fail on missing assets.
  if (sourcePath) {
    await sharp(sourcePath).resize(1200, 630, { fit: 'cover' }).png().toFile(outOg);
    await sharp(sourcePath).resize(192, 192, { fit: 'cover' }).png().toFile(out192);
    await sharp(sourcePath).resize(512, 512, { fit: 'cover' }).png().toFile(out512);
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

