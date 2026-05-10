import { fleetPublicStorageObjectUrl } from '@/lib/supabase/fleetPublicStorageUrl';
import {
  DAMAGE_SIDES,
  DAMAGE_SIDE_LABELS,
  DAMAGE_TYPE_LABELS,
  type VehicleDamageReport,
} from '@/lib/vehicleDamage';

async function imageUrlToDataUrl(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const contentType = blob.type.toLowerCase();
    const format: 'PNG' | 'JPEG' = contentType.includes('png') ? 'PNG' : 'JPEG';
    return { dataUrl, format };
  } catch {
    return null;
  }
}

let cachedPdfCarImage: { dataUrl: string; format: 'PNG' | 'JPEG' } | null = null;

function getFuturisticCarPublicUrl(): string {
  return fleetPublicStorageObjectUrl('logos/car.jpg');
}

async function getPdfCarImage() {
  if (cachedPdfCarImage) {
    return cachedPdfCarImage;
  }

  const candidates = [
    getFuturisticCarPublicUrl(),
    typeof window !== 'undefined' ? `${window.location.origin}/car.png` : null,
  ].filter(Boolean) as string[];

  for (const source of candidates) {
    const loaded = await imageUrlToDataUrl(source);
    if (loaded) {
      cachedPdfCarImage = loaded;
      return loaded;
    }
  }

  return null;
}

async function rotateCarImagePortrait(image: { dataUrl: string; format: 'PNG' | 'JPEG' }) {
  try {
    const rotatedDataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not create canvas context for rotation'));
          return;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not load car image for rotation'));
      img.src = image.dataUrl;
    });

    return { dataUrl: rotatedDataUrl, format: 'PNG' as const };
  } catch {
    return image;
  }
}

/** `onlyIfDamage` — כמו באשף PDF סופי; `always` — תצוגה מקדימה / טופס מודפס ריק עם תרשים */
export type VehicleDamageDiagramPdfMode = 'onlyIfDamage' | 'always';

/**
 * תרשים נזקים (תמונת רכב + ארבע צדדים). משמש את אשף המסירה ואת PDF המובנה במרכז הטפסים.
 */
export async function drawVehicleDamageDiagramInPdf(
  doc: any,
  pageWidth: number,
  rightX: number,
  startY: number,
  damageReport: VehicleDamageReport,
  mode: VehicleDamageDiagramPdfMode = 'onlyIfDamage',
): Promise<number> {
  const hasDamage = DAMAGE_SIDES.some((side) => (damageReport[side] ?? []).length > 0);
  if (mode === 'onlyIfDamage' && !hasDamage) {
    return startY;
  }

  const panelX = 40;
  const panelY = startY + 8;
  const panelW = pageWidth - 80;
  const panelH = 312;

  doc.setDrawColor(40, 80, 120);
  doc.setFillColor(245, 250, 255);
  doc.roundedRect(panelX, panelY, panelW, panelH, 10, 10, 'FD');

  doc.setFontSize(12);
  const title =
    mode === 'always'
      ? 'סימון נזקים לפי צד ברכב (למילוי / תצוגה מקדימה)'
      : 'סימון נזקים לפי צד ברכב';
  doc.text(title, rightX - 12, panelY + 18, { align: 'right' });

  const cx = panelX + panelW / 2;
  const carY = panelY + 48;
  const carW = 124;
  const carH = 220;

  const markSide = (x: number, y: number, w: number, h: number, side: keyof VehicleDamageReport, label: string) => {
    const marked = (damageReport[side] ?? []).length > 0;
    doc.setDrawColor(marked ? 220 : 120, marked ? 38 : 120, marked ? 38 : 160);
    if (marked) {
      doc.setFillColor(255, 232, 232);
      doc.roundedRect(x, y, w, h, 6, 6, 'FD');
    } else {
      doc.roundedRect(x, y, w, h, 6, 6, 'S');
    }
    doc.setFontSize(9);
    doc.text(label, x + w / 2, y + h / 2 + 3, { align: 'center' });
  };

  const sourceCarImage = await getPdfCarImage();
  const carImage = sourceCarImage ? await rotateCarImagePortrait(sourceCarImage) : null;
  if (carImage) {
    doc.addImage(carImage.dataUrl, carImage.format, cx - carW / 2, carY, carW, carH, undefined, 'MEDIUM');
  } else {
    doc.setDrawColor(90, 110, 140);
    doc.setFillColor(214, 224, 238);
    doc.roundedRect(cx - 40, carY + 8, 80, 108, 20, 20, 'FD');
    doc.setFillColor(120, 140, 166);
    doc.roundedRect(cx - 26, carY + 22, 52, 22, 6, 6, 'F');
    doc.roundedRect(cx - 26, carY + 82, 52, 22, 6, 6, 'F');
  }

  markSide(cx - 32, carY - 22, 64, 18, 'front', 'קדימה');
  markSide(cx - 32, carY + carH + 6, 64, 18, 'back', 'אחורה');
  markSide(cx + carW / 2 + 8, carY + 88, 44, 42, 'right', 'צד ימין');
  markSide(cx - carW / 2 - 52, carY + 88, 44, 42, 'left', 'צד שמאל');

  let textY = panelY + panelH - 18;
  doc.setFontSize(9);
  if (hasDamage) {
    for (const side of DAMAGE_SIDES) {
      const types = damageReport[side] ?? [];
      if (!types.length) continue;
      const line = `${DAMAGE_SIDE_LABELS[side]}: ${types.map((type) => DAMAGE_TYPE_LABELS[type]).join(', ')}`;
      doc.text(line, rightX - 12, textY, { align: 'right' });
      textY -= 12;
    }
  } else if (mode === 'always') {
    doc.setTextColor(90, 95, 110);
    doc.text('באשף המסירה יופיעו כאן הנזקים שנבחרו; ניתן גם לסמן ידנית על גבי הדפסה.', rightX - 12, textY, {
      align: 'right',
    });
    doc.setTextColor(0, 0, 0);
  }

  return panelY + panelH + 10;
}
