/**
 * Builds square PWA/favicon from og-image.png:
 * - Knock out dark background → transparent (no black box in tab).
 * - Trim to visible content, then scale so the white car fills the icon.
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'og-image.png');

/** Pixels darker than this (avg RGB) become transparent — removes black/dark blue bg */
const LUM_THRESHOLD = 55;
/** Slightly soften edge: partial transparency in a band (optional second pass could blur alpha) */

async function knockOutDarkToTransparent() {
  const pipeline = sharp(src).ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error('Expected RGBA after ensureAlpha');
  }
  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = out[o];
    const g = out[o + 1];
    const b = out[o + 2];
    const lum = (r + g + b) / 3;
    if (lum < LUM_THRESHOLD) {
      out[o + 3] = 0; // transparent
    }
  }
  return sharp(out, {
    raw: { width, height, channels: 4 },
  }).png();
}

async function buildIcon(size) {
  let pipeline = await knockOutDarkToTransparent();

  // Crop to non-transparent bounds (tight around car)
  pipeline = pipeline.trim({
    threshold: 0,
    lineArt: false,
  });

  // Optional: remove thin text strip under car if still present (crop bottom ~8%)
  const meta = await pipeline.metadata();
  if (meta.height && meta.width && meta.height > meta.width * 0.75) {
    const cropH = Math.round(meta.height * 0.92);
    pipeline = pipeline.extract({
      left: 0,
      top: 0,
      width: meta.width,
      height: cropH,
    });
  }

  // Fit inside square with transparent padding — car as large as possible, no forced bg
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  return pipeline
    .resize(size, size, {
      fit: 'inside',
      background: transparent,
    })
    .extend({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      background: transparent,
    })
    .png()
    .toBuffer();
}

// Ensure square canvas size (inside might not be square — pad to square transparent)
async function buildSquarePng(size) {
  const buf = await buildIcon(size);
  // Resize result might be WxH < size — composite onto size x size transparent
  const meta = await sharp(buf).metadata();
  const w = meta.width || size;
  const h = meta.height || size;
  const left = Math.round((size - w) / 2);
  const top = Math.round((size - h) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: buf, left, top }])
    .png()
    .toBuffer();
}

const out512 = join(root, 'public', 'app-icon-512.png');
const out192 = join(root, 'public', 'app-icon-192.png');

const buf512 = await buildSquarePng(512);
const buf192 = await buildSquarePng(192);
writeFileSync(out512, buf512);
writeFileSync(out192, buf192);
console.log('Wrote', out512, out192, '(car only, transparent bg)');
