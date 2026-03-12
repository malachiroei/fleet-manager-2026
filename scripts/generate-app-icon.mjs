/**
 * App icon = car as in app (og-image): white + blue glow.
 * - Knock out dark bg → transparent around car.
 * - Crop bottom of SOURCE before trim to drop "Fleet Manager Pro".
 * - Light plate #f4f4f5 (tabs replace transparency with black otherwise).
 * - Black stroke only around car bbox — no black fill.
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'og-image.png');

const LUM_THRESHOLD = 52;
const BLACK = '#000000';

async function knockOutDarkToTransparent() {
  const pipeline = sharp(src).ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error('Expected RGBA after ensureAlpha');
  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const lum = (out[o] + out[o + 1] + out[o + 2]) / 3;
    if (lum < LUM_THRESHOLD) out[o + 3] = 0;
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png();
}

function frameStrokeSvg(size, x, y, w, h, strokeW, rx) {
  const sw = Math.max(2, strokeW);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}"
        fill="none" stroke="${BLACK}" stroke-width="${sw}"/>
    </svg>`
  );
}

async function buildIcon(size) {
  // Crop from source first (avoid extract on trimmed pipeline)
  const srcMeta = await sharp(src).metadata();
  let pipeline = await knockOutDarkToTransparent();
  if (srcMeta.width && srcMeta.height && srcMeta.height > 100) {
    const keepH = Math.floor(srcMeta.height * 0.72);
    if (keepH > 0 && keepH < srcMeta.height) {
      pipeline = sharp(src).ensureAlpha().extract({
        left: 0,
        top: 0,
        width: srcMeta.width,
        height: keepH,
      });
      // Re-apply knock-out on cropped region only
      const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
      const out = Buffer.from(data);
      for (let i = 0; i < info.width * info.height; i++) {
        const o = i * 4;
        const lum = (out[o] + out[o + 1] + out[o + 2]) / 3;
        if (lum < LUM_THRESHOLD) out[o + 3] = 0;
      }
      pipeline = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
    }
  }
  pipeline = pipeline.trim({ threshold: 0, lineArt: false });

  const margin = Math.max(8, Math.round(size * 0.08));
  const strokeW = Math.max(3, Math.round(size * 0.035));
  const innerMax = Math.max(64, size - 2 * margin - 2 * strokeW);

  const carBuf = await pipeline
    .resize(innerMax, innerMax, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const cm = await sharp(carBuf).metadata();
  const cw = cm.width || innerMax;
  const ch = cm.height || innerMax;
  const left = Math.round((size - cw) / 2);
  const top = Math.round((size - ch) / 2);
  const pad = Math.max(4, Math.round(size * 0.02));
  const rx = Math.round(size * 0.08);
  let fx = Math.max(0, left - pad);
  let fy = Math.max(0, top - pad);
  let fw = Math.min(size - fx, cw + 2 * pad);
  let fh = Math.min(size - fy, ch + 2 * pad);

  const frameSvg = frameStrokeSvg(size, fx, fy, fw, fh, strokeW, rx);
  const frameBuf = await sharp(frameSvg).png().toBuffer();

  const plate = { r: 244, g: 244, b: 245, alpha: 1 };
  return sharp({
    create: { width: size, height: size, channels: 4, background: plate },
  })
    .composite([
      { input: carBuf, left, top },
      { input: frameBuf, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

const out512 = join(root, 'public', 'app-icon-512.png');
const out192 = join(root, 'public', 'app-icon-192.png');

const buf512 = await buildIcon(512);
const buf192 = await buildIcon(192);
writeFileSync(out512, buf512);
writeFileSync(out192, buf192);
console.log('Wrote', out512, out192, '(car as in app + light plate + black stroke only)');
