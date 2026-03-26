import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseAnonKey, getSupabasePublishableKey, getSupabaseUrl } from '@/integrations/supabase/publicEnv';
import type { VehicleHandover } from '@/types/fleet';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import hebrewFontUrl from '@/assets/fonts/NotoSansHebrew.ttf?url';
import { fleetPublicStorageObjectUrl } from '@/lib/supabase/fleetPublicStorageUrl';
import {
  DAMAGE_SIDES,
  DAMAGE_SIDE_LABELS,
  DAMAGE_TYPE_LABELS,
  hasAnyDamage,
  summarizeDamageReport,
  type VehicleDamageReport,
} from '@/lib/vehicleDamage';

export type AssignmentMode = 'permanent' | 'replacement';

const APP_BASE_URL = 'https://fleet-manager-pro.com';
const HANDOVER_PHOTOS_BUCKET = 'handover-photos';
const HANDOVER_ARCHIVE_BUCKET = 'vehicle-documents';

function formatVehicleLabelForPdf(label: string) {
  const trimmed = String(label ?? '').trim();
  const match = trimmed.match(/^(.*)\(([^)]+)\)\s*$/);
  if (match) return `${match[1].trim()} - ${match[2].trim()}`;
  return trimmed.replace(/[()]/g, '');
}

function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Unknown error';
  }

  const maybeError = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
    statusCode?: string | number;
    error?: string;
  };

  return [
    maybeError.message,
    maybeError.details,
    maybeError.hint,
    maybeError.code ? `code=${maybeError.code}` : undefined,
    maybeError.statusCode ? `status=${maybeError.statusCode}` : undefined,
    maybeError.error,
  ]
    .filter(Boolean)
    .join(' | ');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

let cachedHebrewFontBase64: string | null = null;
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

function drawFuelGaugeInPdf(doc: any, rightX: number, startY: number, fuelLevel: number) {
  const panelW = 168;
  const panelH = 150;
  const panelX = rightX - panelW;
  const panelY = startY + 2;
  const clampedFuel = Math.max(0, Math.min(8, Math.round(fuelLevel)));

  doc.setDrawColor(84, 125, 164);
  doc.setFillColor(245, 250, 255);
  doc.roundedRect(panelX, panelY, panelW, panelH, 8, 8, 'FD');
  doc.setFontSize(11);
  doc.text('מחוון דלק', rightX - 10, panelY + 16, { align: 'right' });

  const gaugeX = panelX + 26;
  const gaugeY = panelY + 28;
  const segW = 54;
  const segH = 10;
  const segGap = 4;

  doc.setFontSize(8);
  doc.text('F', gaugeX - 10, gaugeY + 7, { align: 'center' });
  doc.text('E', gaugeX - 10, gaugeY + (segH + segGap) * 8 + 2, { align: 'center' });

  for (let segment = 8; segment >= 1; segment -= 1) {
    const idx = 8 - segment;
    const y = gaugeY + idx * (segH + segGap);
    const filled = segment <= clampedFuel;
    if (filled) {
      if (clampedFuel <= 2) {
        doc.setFillColor(220, 38, 38);
      } else {
        doc.setFillColor(22, 163, 74);
      }
      doc.setDrawColor(140, 140, 140);
      doc.roundedRect(gaugeX, y, segW, segH, 2, 2, 'FD');
    } else {
      doc.setDrawColor(160, 174, 192);
      doc.roundedRect(gaugeX, y, segW, segH, 2, 2, 'S');
    }
  }

  const needleBaseSegment = clampedFuel > 0 ? clampedFuel : 1;
  const needleY = gaugeY + (8 - needleBaseSegment) * (segH + segGap) + segH / 2;
  doc.setFillColor(30, 41, 59);
  doc.triangle(gaugeX + segW + 4, needleY, gaugeX + segW + 14, needleY - 5, gaugeX + segW + 14, needleY + 5, 'F');

  doc.setFontSize(10);
  doc.text(`${clampedFuel}/8`, panelX + panelW - 16, panelY + panelH - 12, { align: 'right' });
  return panelY + panelH + 8;
}

async function drawDamageDiagramInPdf(
  doc: any,
  pageWidth: number,
  rightX: number,
  startY: number,
  damageReport: VehicleDamageReport,
) {
  const hasDamage = DAMAGE_SIDES.some((side) => damageReport[side]?.length > 0);
  if (!hasDamage) {
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
  doc.text('סימון נזקים לפי צד ברכב', rightX - 12, panelY + 18, { align: 'right' });

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
    // Fallback: keep a basic shape if image loading fails.
    doc.setDrawColor(90, 110, 140);
    doc.setFillColor(214, 224, 238);
    doc.roundedRect(cx - 40, carY + 8, 80, 108, 20, 20, 'FD');
    doc.setFillColor(120, 140, 166);
    doc.roundedRect(cx - 26, carY + 22, 52, 22, 6, 6, 'F');
    doc.roundedRect(cx - 26, carY + 82, 52, 22, 6, 6, 'F');
  }

  // Keep the same orientation as the app selector:
  // front=top, back=bottom, right=right side, left=left side.
  markSide(cx - 32, carY - 22, 64, 18, 'front', 'קדימה');
  markSide(cx - 32, carY + carH + 6, 64, 18, 'back', 'אחורה');
  markSide(cx + carW / 2 + 8, carY + 88, 44, 42, 'right', 'צד ימין');
  markSide(cx - carW / 2 - 52, carY + 88, 44, 42, 'left', 'צד שמאל');

  // Damage legend text
  let textY = panelY + panelH - 18;
  doc.setFontSize(9);
  for (const side of DAMAGE_SIDES) {
    const types = damageReport[side] ?? [];
    if (!types.length) continue;
    const line = `${DAMAGE_SIDE_LABELS[side]}: ${types.map((type) => DAMAGE_TYPE_LABELS[type]).join(', ')}`;
    doc.text(line, rightX - 12, textY, { align: 'right' });
    textY -= 12;
  }

  return panelY + panelH + 10;
}

async function createPdfBlob(
  lines: string[],
  photos: Array<{ key: string; url: string | null }>,
  signatureUrl: string | null,
  fuelLevel?: number,
  damageReport?: VehicleDamageReport,
) {
  const fontResponse = await fetch(hebrewFontUrl);

  if (!fontResponse.ok) {
    throw new Error(`Failed loading Hebrew font (${fontResponse.status})`);
  }

  if (!cachedHebrewFontBase64) {
    cachedHebrewFontBase64 = arrayBufferToBase64(await fontResponse.arrayBuffer());
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  doc.addFileToVFS('NotoSansHebrew.ttf', cachedHebrewFontBase64);
  doc.addFont('NotoSansHebrew.ttf', 'NotoSansHebrew', 'normal');
  doc.setFont('NotoSansHebrew', 'normal');
  doc.setR2L(true);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const rightX = pageWidth - 40;
  const pageBottomPadding = 36;
  const resetYAfterPageBreak = () => 48;

  const ensurePageSpace = (currentY: number, requiredHeight: number) => {
    if (currentY + requiredHeight <= pageHeight - pageBottomPadding) {
      return currentY;
    }
    doc.addPage();
    return resetYAfterPageBreak();
  };

  doc.setFontSize(16);
  doc.text('טופס מסירה / החזרת רכב', pageWidth / 2, 56, { align: 'center' });

  doc.setFontSize(11);
  let currentY = 86;
  for (const line of lines) {
    doc.text(line, rightX, currentY, { align: 'right' });
    currentY += 18;
  }

  if (typeof fuelLevel === 'number' && Number.isFinite(fuelLevel)) {
    currentY = ensurePageSpace(currentY, 170);
    currentY = drawFuelGaugeInPdf(doc, rightX, currentY, fuelLevel);
  }

  if (damageReport && hasAnyDamage(damageReport)) {
    currentY = ensurePageSpace(currentY, 340);
    currentY = await drawDamageDiagramInPdf(doc, pageWidth, rightX, currentY, damageReport);
  }

  const photoEntries = photos.filter((photo) => !!photo.url) as Array<{ key: string; url: string }>;
  const photoImages = await Promise.all(
    photoEntries.map(async (photo) => ({ key: photo.key, image: await imageUrlToDataUrl(photo.url) }))
  );

  const validPhotoImages = photoImages.filter((photo) => !!photo.image) as Array<{ key: string; image: { dataUrl: string; format: 'PNG' | 'JPEG' } }>;
  const photoLabels: Record<string, string> = {
    front: 'קדימה',
    back: 'אחורה',
    right: 'ימין',
    left: 'שמאל',
  };
  const photoStatusLine = (['front', 'back', 'right', 'left'] as const)
    .map((key) => `${photoLabels[key]}: ${photos.find((p) => p.key === key)?.url ? 'צורפה' : 'חסרה'}`)
    .join(' | ');

  if (validPhotoImages.length > 0) {
    const cards = validPhotoImages.slice(0, 4);
    const estimatedPhotosHeight =
      cards.length === 1 ? 230 :
      cards.length === 2 ? 210 :
      300;
    currentY = ensurePageSpace(currentY, estimatedPhotosHeight);

    doc.setFontSize(12);
    doc.text('תמונות רכב', rightX, currentY + 4, { align: 'right' });

    const gridTop = currentY + 16;
    const marginX = 40;
    const gap = 12;

    if (cards.length === 1) {
      const boxWidth = pageWidth - marginX * 2;
      const boxHeight = 180;
      const x = marginX;
      const y = gridTop;
      const photo = cards[0];

      doc.addImage(photo.image.dataUrl, photo.image.format, x, y, boxWidth, boxHeight, undefined, 'MEDIUM');
      doc.setFontSize(10);
      doc.text(photoLabels[photo.key] || photo.key, x + boxWidth - 4, y + boxHeight + 12, { align: 'right' });
      currentY = y + boxHeight + 18;
    } else if (cards.length === 2) {
      const boxWidth = (pageWidth - marginX * 2 - gap) / 2;
      const boxHeight = 165;

      cards.forEach((photo, index) => {
        const x = marginX + index * (boxWidth + gap);
        const y = gridTop;
        doc.addImage(photo.image.dataUrl, photo.image.format, x, y, boxWidth, boxHeight, undefined, 'MEDIUM');
        doc.setFontSize(10);
        doc.text(photoLabels[photo.key] || photo.key, x + boxWidth - 4, y + boxHeight + 12, { align: 'right' });
      });

      currentY = gridTop + boxHeight + 18;
    } else {
      const boxWidth = (pageWidth - marginX * 2 - gap) / 2;
      const boxHeight = 126;

      cards.forEach((photo, index) => {
        const row = Math.floor(index / 2);
        const col = index % 2;
        const x = marginX + col * (boxWidth + gap);
        const y = gridTop + row * (boxHeight + 24);

        doc.addImage(photo.image.dataUrl, photo.image.format, x, y, boxWidth, boxHeight, undefined, 'MEDIUM');
        doc.setFontSize(10);
        doc.text(photoLabels[photo.key] || photo.key, x + boxWidth - 4, y + boxHeight + 12, { align: 'right' });
      });

      currentY = gridTop + (cards.length > 2 ? (boxHeight + 24) * 2 : (boxHeight + 24)) + 4;
    }
  } else {
    doc.setFontSize(10);
    doc.text('תמונות רכב: לא צורפו תמונות לשלב זה', rightX, currentY + 12, { align: 'right' });
    currentY += 20;
  }

  currentY = ensurePageSpace(currentY, 40);
  doc.setFontSize(9);
  doc.text(`סטטוס תמונות: ${photoStatusLine}`, rightX, currentY + 8, { align: 'right' });
  currentY += 16;

  if (signatureUrl) {
    const signatureImage = await imageUrlToDataUrl(signatureUrl);
    if (signatureImage) {
      currentY = ensurePageSpace(currentY, 112);
      const signatureBlockHeight = 96;
      const signatureY = Math.min(currentY + 4, pageHeight - signatureBlockHeight - 36);
      doc.setFontSize(12);
      doc.text('חתימה', rightX, signatureY + 10, { align: 'right' });

      const sigWidth = 220;
      const sigHeight = 64;
      const sigX = pageWidth - 40 - sigWidth;
      const sigY = signatureY + 18;
      doc.rect(sigX, sigY, sigWidth, sigHeight);
      doc.addImage(signatureImage.dataUrl, signatureImage.format, sigX + 2, sigY + 2, sigWidth - 4, sigHeight - 4, undefined, 'FAST');
    }
  }

  return doc.output('blob');
}

// ─────────────────────────────────────────────────────────────────────
// Wizard step PDF generators
// ─────────────────────────────────────────────────────────────────────

async function buildWizardPdfDoc(
  title: string,
  vehicleLabel: string,
  driverName: string,
  date: string,
) {
  if (!cachedHebrewFontBase64) {
    const fontResponse = await fetch(hebrewFontUrl);
    if (!fontResponse.ok) throw new Error(`Font fetch failed: ${fontResponse.status}`);
    cachedHebrewFontBase64 = arrayBufferToBase64(await fontResponse.arrayBuffer());
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSansHebrew.ttf', cachedHebrewFontBase64);
  doc.addFont('NotoSansHebrew.ttf', 'NotoSansHebrew', 'normal');
  doc.setFont('NotoSansHebrew', 'normal');
  doc.setR2L(true);

  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 40;

  doc.setFontSize(18);
  doc.text(title, pageWidth / 2, 50, { align: 'center' });

  doc.setFontSize(10);
  let y = 76;
  for (const line of [`תאריך: ${date}`, `רכב: ${formatVehicleLabelForPdf(vehicleLabel)}`, `נהג: ${driverName}`]) {
    doc.text(line, rightX, y, { align: 'right' });
    y += 14;
  }

  doc.setDrawColor(180);
  doc.line(40, y + 4, pageWidth - 40, y + 4);
  y += 18;

  return { doc, pageWidth, rightX, y };
}

function addSignatureToPdf(
  doc: ReturnType<Awaited<ReturnType<typeof buildWizardPdfDoc>>['doc']['constructor']>,
  signatureDataUrl: string | null,
  y: number,
  pageWidth: number,
  rightX: number,
  label: string,
) {
  doc.setFontSize(11);
  doc.text(label, rightX, y, { align: 'right' });
  const sigW = 220, sigH = 64;
  const sigX = pageWidth - 40 - sigW;
  const sigY = y + 10;
  doc.rect(sigX, sigY, sigW, sigH);
  if (signatureDataUrl) {
    (doc as any).addImage(signatureDataUrl, 'PNG', sigX + 2, sigY + 2, sigW - 4, sigH - 4);
  }
}

export async function generateReceptionPDF({
  vehicleLabel,
  driverName,
  date,
  accessories,
  signatureDataUrl,
  declarationText,
  manualFields,
}: {
  vehicleLabel: string;
  driverName: string;
  date: string;
  accessories: Array<{ name: string; maxPrice: string; checked: boolean; notes: string }>;
  signatureDataUrl: string | null;
  declarationText?: string;
  manualFields?: {
    idNumber?: string;
    employeeNumber?: string;
    phone?: string;
    address?: string;
    ignitionCode?: string;
  };
}): Promise<Blob> {
  const { doc, pageWidth, rightX, y: startY } = await buildWizardPdfDoc(
    'טופס קבלת רכב',
    vehicleLabel,
    driverName,
    date,
  );
  let y = startY;

  doc.setFontSize(10);
  if (declarationText?.trim()) {
    const declarationLines = declarationText
      .split('\n')
      .flatMap((line) => doc.splitTextToSize(line || ' ', 460) as string[]);
    doc.text(declarationLines, rightX, y, { align: 'right' });
    y += declarationLines.length * 12 + 12;
  } else {
    doc.text('אני הח"מ מאשר/ת כי קיבלתי את הרכב הנ"ל וכי הפריטים הבאים נמסרו לי:', rightX, y, { align: 'right' });
    y += 18;
  }

  doc.setFontSize(9);
  for (const acc of accessories) {
    const mark = acc.checked ? '[✓]' : '[ ]';
    const notePart = acc.notes ? ` — ${acc.notes}` : '';
    const line = `${mark}  ${acc.name}  (${acc.maxPrice})${notePart}`;
    doc.text(line, rightX, y, { align: 'right' });
    y += 14;
  }

  y += 12;
  doc.setFontSize(10);
  doc.text('3. שדות מילוי ידני:', rightX, y, { align: 'right' });
  y += 16;

  const footerLines = [
    `מספר ת"ז: ${manualFields?.idNumber || 'לא הוזן'}`,
    `מספר עובד: ${manualFields?.employeeNumber || 'לא הוזן'}`,
    `טלפון נייד: ${manualFields?.phone || 'לא הוזן'}`,
    `כתובת: ${manualFields?.address || 'לא הוזנה'}`,
    `קוד קודנית: ${manualFields?.ignitionCode || 'לא הוזן'}`,
  ];
  doc.setFontSize(9);
  for (const line of footerLines) {
    doc.text(line, rightX, y, { align: 'right' });
    y += 14;
  }

  y += 12;
  addSignatureToPdf(doc as any, signatureDataUrl, y, pageWidth, rightX, '4. חתימת הנהג — אישור קבלת הרכב והאביזרים:');
  return doc.output('blob');
}

export async function generateProcedurePDF({
  formTitle,
  vehicleLabel,
  driverName,
  date,
  clauses,
  approvedRead,
  signatureDataUrl,
}: {
  formTitle?: string;
  vehicleLabel: string;
  driverName: string;
  date: string;
  clauses: Array<{ id: number; text: string }>;
  approvedRead?: boolean;
  signatureDataUrl: string | null;
}): Promise<Blob> {
  const { doc, pageWidth, rightX, y: startY } = await buildWizardPdfDoc(
    formTitle?.trim() || 'נוהל שימוש ברכב חברה',
    vehicleLabel,
    driverName,
    date,
  );
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;

  doc.setFontSize(9);
  for (const clause of clauses) {
    const split = doc.splitTextToSize(`${clause.id}. ${clause.text}`, 460) as string[];
    if (y + split.length * 13 + 90 > pageHeight) {
      doc.addPage();
      y = 50;
    }
    doc.text(split, rightX, y, { align: 'right' });
    y += split.length * 13 + 3;
  }

  y += 10;
  doc.setFontSize(9);
  const commitText = doc.splitTextToSize(
    'אני מאשר/ת כי קראתי והבנתי את הטופס ואני מתחייב/ת לפעול לפיו.',
    460,
  ) as string[];
  if (y + commitText.length * 13 + 90 > pageHeight) {
    doc.addPage();
    y = 50;
  }
  doc.text(commitText, rightX, y, { align: 'right' });
  y += commitText.length * 13 + 10;
  doc.setFontSize(10);
  doc.text(`אישור קריאה: ${approvedRead ? 'מאושר' : 'לא אושר'}`, rightX, y, { align: 'right' });
  y += 14;
  addSignatureToPdf(doc as any, signatureDataUrl, y, pageWidth, rightX, 'חתימת הנהג:');
  return doc.output('blob');
}

export async function generateHealthDeclarationPDF({
  vehicleLabel,
  driverName,
  date,
  healthItems,
  notes,
  signatureDataUrl,
}: {
  vehicleLabel: string;
  driverName: string;
  date: string;
  healthItems: Array<{ text: string; checked: boolean }>;
  notes: string;
  signatureDataUrl: string | null;
}): Promise<Blob> {
  const { doc, pageWidth, rightX, y: startY } = await buildWizardPdfDoc(
    'הצהרת בריאות נהג',
    vehicleLabel,
    driverName,
    date,
  );
  let y = startY;

  doc.setFontSize(10);
  doc.text('אני הח"מ מצהיר/ה כי מצב בריאותי מאפשר נהיגה בטוחה, וכי הפרטים הבאים נכונים:', rightX, y, {
    align: 'right',
  });
  y += 18;

  doc.setFontSize(9);
  for (let i = 0; i < healthItems.length; i++) {
    const item = healthItems[i];
    const mark = item.checked ? 'מאושר' : 'לא אושר';
    const split = doc.splitTextToSize(`(${mark}) ${i + 1}. ${item.text}`, 460) as string[];
    doc.text(split, rightX, y, { align: 'right' });
    y += split.length * 13 + 4;
  }

  if (notes) {
    y += 6;
    doc.setFontSize(10);
    doc.text('הערות:', rightX, y, { align: 'right' });
    y += 14;
    doc.setFontSize(9);
    const splitNotes = doc.splitTextToSize(notes, 460) as string[];
    doc.text(splitNotes, rightX, y, { align: 'right' });
    y += splitNotes.length * 13 + 4;
  }

  y += 12;
  addSignatureToPdf(doc as any, signatureDataUrl, y, pageWidth, rightX, 'חתימת הנהג — הצהרת בריאות:');
  return doc.output('blob');
}

export async function generateReplacementDeliveryApprovalPDF({
  vehicleLabel,
  driverName,
  date,
  signatureDataUrl,
}: {
  vehicleLabel: string;
  driverName: string;
  date: string;
  signatureDataUrl: string | null;
}): Promise<Blob> {
  const { doc, pageWidth, rightX, y: startY } = await buildWizardPdfDoc(
    'אישור מסירת רכב חליפי',
    vehicleLabel,
    driverName,
    date,
  );

  let y = startY;
  const clauses = [
    'הריני מאשר/ת שקיבלתי רכב חליפי תקין ובדקתי את הרכב לפני יציאה לנסיעה.',
    'הוסבר לי כי האחריות לשלמות הרכב החליפי ולדיווח על כל תקלה או נזק היא עלי.',
    'ידוע לי כי השימוש ברכב החליפי כפוף לנהלי החברה ולכללי הבטיחות.',
  ];

  doc.setFontSize(10);
  doc.text('אני הח"מ מאשר/ת את הסעיפים הבאים:', rightX, y, { align: 'right' });
  y += 18;

  doc.setFontSize(9);
  for (const clause of clauses) {
    const split = doc.splitTextToSize(`• ${clause}`, 460) as string[];
    doc.text(split, rightX, y, { align: 'right' });
    y += split.length * 13 + 4;
  }

  y += 10;
  addSignatureToPdf(doc as any, signatureDataUrl, y, pageWidth, rightX, 'חתימת העובד — אישור מסירת רכב חליפי:');
  return doc.output('blob');
}

export async function generateGenericFormPDF({
  title,
  builtinTemplateKey,
  vehicleLabel,
  driverName,
  date,
  templateText,
  notes,
  signatureDataUrl,
  returnDateTime,
  fuelLevel,
  damageReport,
  missingAccessories,
  practicalTestUi,
  trafficLiabilityUi,
  upgradeUi,
  returnFormUi,
  receptionFields,
}: {
  title: string;
  builtinTemplateKey?: string;
  vehicleLabel: string;
  driverName: string;
  date: string;
  templateText: string;
  notes?: string;
  signatureDataUrl: string | null;
  returnDateTime?: string;
  fuelLevel?: number;
  damageReport?: VehicleDamageReport;
  missingAccessories?: string[];
  practicalTestUi?: {
    checks?: Record<string, 'pass' | 'fail' | ''>;
    date?: string;
    time?: string;
    examinerName?: string;
    result?: 'pass' | 'fail' | '';
  };
  trafficLiabilityUi?: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    fullAddress?: string;
    mobile?: string;
  };
  upgradeUi?: {
    vehicleNameToUpgrade?: string;
    netUpgradeAmount?: string;
    fullName?: string;
  };
  returnFormUi?: {
    returnDate?: string;
    returnTime?: string;
    odometer?: string;
    fuel?: string;
    damages?: string;
    missingAccessories?: string;
  };
  receptionFields?: {
    idNumber?: string;
    employeeNumber?: string;
    phone?: string;
    address?: string;
    ignitionCode?: string;
  };
}): Promise<Blob> {
  const { doc, pageWidth, rightX, y: startY } = await buildWizardPdfDoc(title, vehicleLabel, driverName, date);
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;

  const ensureSpace = (required: number) => {
    if (y + required <= pageHeight - 36) return;
    doc.addPage();
    y = 50;
  };

  const rawLines = String(templateText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const key = String(builtinTemplateKey ?? '').trim();
  const isReturnForm = key === 'system-return-form' || title.includes('החזרת רכב');
  const isTrafficLiabilityForm =
    key === 'system-traffic-liability-annex' ||
    (title.includes('אחריות אישית') && title.includes('עבירות תנועה'));
  const isUpgradeForm = key === 'system-upgrade-request' || title.includes('שדרוג');
  const isPracticalDrivingTestForm =
    key === 'system-practical-driving-test' || title.includes('מבחן מעשי בנהיגה');
  const filteredLines = isUpgradeForm
    ? rawLines.filter(
        (line) =>
          !line.includes('דגם הרכב המבוקש') &&
          !line.includes('סכום חיוב חודשי') &&
          !line.includes('שדות מילוי ידני'),
      )
    : rawLines;

  doc.setFontSize(10);
  for (const line of filteredLines) {
    const split = doc.splitTextToSize(line, 460) as string[];
    ensureSpace(split.length * 13 + 6);
    doc.text(split, rightX, y, { align: 'right' });
    y += split.length * 13 + 3;
  }

  if (isUpgradeForm) {
    y += 8;
    ensureSpace(150);
    doc.setFontSize(11);
    doc.text('3. שדות מילוי ידני (למילוי ידני על גבי הטופס):', rightX, y, { align: 'right' });
    y += 16;
    doc.setFontSize(10);
    const upgradeDate = date;
    const blankLines = [
      `• שם הרכב לשדרוג: ${upgradeUi?.vehicleNameToUpgrade?.trim() || '_____________________________'}`,
      `• סכום שדרוג נטו: ${upgradeUi?.netUpgradeAmount?.trim() || '____________________________'}`,
      `• שם מלא: ${upgradeUi?.fullName?.trim() || '____________________________________'}`,
      `• תאריך: ${upgradeDate}`,
    ];
    for (const line of blankLines) {
      doc.text(line, rightX, y, { align: 'right' });
      y += 14;
    }
  }

  const needsReceptionFields = title.includes('קבלת רכב');
  if (needsReceptionFields && receptionFields) {
    y += 8;
    ensureSpace(120);
    doc.setFontSize(11);
    doc.text('3. שדות מילוי ידני:', rightX, y, { align: 'right' });
    y += 14;
    doc.setFontSize(9);
    const lines = [
      `מספר ת"ז: ${receptionFields.idNumber || 'לא הוזן'}`,
      `מספר עובד: ${receptionFields.employeeNumber || 'לא הוזן'}`,
      `טלפון נייד: ${receptionFields.phone || 'לא הוזן'}`,
      `כתובת: ${receptionFields.address || 'לא הוזנה'}`,
      `קוד קודנית: ${receptionFields.ignitionCode || 'לא הוזן'}`,
    ];
    for (const line of lines) {
      doc.text(line, rightX, y, { align: 'right' });
      y += 13;
    }
  }

  if (isReturnForm) {
    y += 8;
    ensureSpace(220);
    doc.setFontSize(11);
    doc.text('3. פרטי החזרת רכב:', rightX, y, { align: 'right' });
    y += 14;
    doc.setFontSize(10);
    const effectiveReturnDate = returnFormUi?.returnDate?.trim() || '';
    const effectiveReturnTime = returnFormUi?.returnTime?.trim() || '';
    const effectiveReturnDateTime = effectiveReturnDate || effectiveReturnTime
      ? `${effectiveReturnDate || date} ${effectiveReturnTime || ''}`.trim()
      : returnDateTime || date;
    const returnLines = [
      `תאריך ושעת החזרה: ${effectiveReturnDateTime}`,
      `קריאת ק"מ בעת החזרה: ${returnFormUi?.odometer?.trim() || '____________________________'}`,
      `רמת דלק בעת החזרה: ${returnFormUi?.fuel?.trim() || '________________________________'}`,
      `סימון נזקים: ${returnFormUi?.damages?.trim() || '_______________________________________'}`,
      `אביזרים חסרים: ${returnFormUi?.missingAccessories?.trim() || '_______________________________'} ${missingAccessories?.length ? `(דווח כעת: ${missingAccessories.join(', ')})` : ''}`,
    ];
    for (const line of returnLines) {
      doc.text(line, rightX, y, { align: 'right' });
      y += 14;
    }

    if (typeof fuelLevel === 'number' && Number.isFinite(fuelLevel)) {
      ensureSpace(170);
      y = drawFuelGaugeInPdf(doc, rightX, y, fuelLevel);
    }
    if (damageReport && hasAnyDamage(damageReport)) {
      ensureSpace(340);
      y = await drawDamageDiagramInPdf(doc, pageWidth, rightX, y, damageReport);
    }
  }

  if (isTrafficLiabilityForm) {
    y += 8;
    ensureSpace(120);
    doc.setFontSize(11);
    doc.text('פרטי עובד למילוי בסוף הטופס:', rightX, y, { align: 'right' });
    y += 14;
    doc.setFontSize(10);
    const identityLines = [
      `שם: ${trafficLiabilityUi?.firstName?.trim() || '____________________________'}`,
      `שם משפחה: ${trafficLiabilityUi?.lastName?.trim() || '_____________________'}`,
      `מספר ת.ז: ${trafficLiabilityUi?.idNumber?.trim() || '______________________'}`,
      `כתובת מלאה: ${trafficLiabilityUi?.fullAddress?.trim() || '____________________'}`,
      `מספר נייד: ${trafficLiabilityUi?.mobile?.trim() || '_____________________'}`,
    ];
    for (const line of identityLines) {
      doc.text(line, rightX, y, { align: 'right' });
      y += 14;
    }
  }

  if (isPracticalDrivingTestForm) {
    y += 8;
    ensureSpace(300);
    doc.setFontSize(11);
    doc.text('טבלת הערכת מבחן מעשי: עבר / לא עבר', rightX, y, { align: 'right' });
    y += 16;

    const rows = [
      'שליטה בהגה',
      'עצירה',
      'נסיעה לאחור',
      'שליטה כללית ברכב',
      'איתות',
      'מיקום בנתיבי הכביש',
      'מיקום בצמתים',
      'פניות',
      'ציות לתמרורים ורמזורים',
      'הסתכלות',
      'מהירות',
      'קצב נסיעה',
      'שמירת רווח מלפנים ומהצדדים',
    ];

    const tableRight = rightX;
    const colPassedW = 58;
    const colFailedW = 58;
    const colItemW = 260;
    const rowH = 18;
    const tableLeft = tableRight - (colPassedW + colFailedW + colItemW);

    doc.setDrawColor(170, 170, 170);
    doc.rect(tableLeft, y, colPassedW, rowH);
    doc.rect(tableLeft + colPassedW, y, colFailedW, rowH);
    doc.rect(tableLeft + colPassedW + colFailedW, y, colItemW, rowH);
    doc.setFontSize(9);
    doc.text('עבר', tableLeft + colPassedW / 2, y + 12, { align: 'center' });
    doc.text('לא עבר', tableLeft + colPassedW + colFailedW / 2, y + 12, { align: 'center' });
    doc.text('פריט בדיקה', tableRight - 6, y + 12, { align: 'right' });
    y += rowH;

    rows.forEach((item) => {
      ensureSpace(rowH + 4);
      doc.rect(tableLeft, y, colPassedW, rowH);
      doc.rect(tableLeft + colPassedW, y, colFailedW, rowH);
      doc.rect(tableLeft + colPassedW + colFailedW, y, colItemW, rowH);
      doc.circle(tableLeft + colPassedW / 2, y + rowH / 2, 4);
      doc.circle(tableLeft + colPassedW + colFailedW / 2, y + rowH / 2, 4);
      const status = practicalTestUi?.checks?.[item] ?? '';
      if (status === 'pass') {
        doc.setFillColor(30, 64, 175);
        doc.circle(tableLeft + colPassedW / 2, y + rowH / 2, 2.4, 'F');
      } else if (status === 'fail') {
        doc.setFillColor(220, 38, 38);
        doc.circle(tableLeft + colPassedW + colFailedW / 2, y + rowH / 2, 2.4, 'F');
      }
      doc.text(item, tableRight - 6, y + 12, { align: 'right' });
      y += rowH;
    });

    y += 10;
    ensureSpace(110);
    doc.setFontSize(10);
    const footer = [
      `תאריך: ${practicalTestUi?.date?.trim() || '_____________________'}`,
      `שעה: ${practicalTestUi?.time?.trim() || '_______________________'}`,
      `שם הבוחן: ${practicalTestUi?.examinerName?.trim() || '__________________'}`,
      `תוצאת מבחן: ${practicalTestUi?.result === 'pass' ? 'עבר' : practicalTestUi?.result === 'fail' ? 'לא עבר' : 'עבר / לא עבר'}`,
    ];
    footer.forEach((line) => {
      doc.text(line, rightX, y, { align: 'right' });
      y += 14;
    });
  }

  if (notes?.trim()) {
    ensureSpace(56);
    y += 8;
    doc.setFontSize(10);
    doc.text('הערות:', rightX, y, { align: 'right' });
    y += 14;
    const notesSplit = doc.splitTextToSize(notes.trim(), 460) as string[];
    doc.setFontSize(9);
    doc.text(notesSplit, rightX, y, { align: 'right' });
    y += notesSplit.length * 13 + 4;
  }

  y += 10;
  ensureSpace(96);
  addSignatureToPdf(doc as any, signatureDataUrl, y, pageWidth, rightX, 'חתימת הנהג:');
  return doc.output('blob');
}

export async function uploadPdfAttachmentToArchive({
  vehicleId,
  blob,
  fileName,
}: {
  vehicleId: string;
  blob: Blob;
  fileName: string;
}): Promise<string> {
  const path = `documents/${vehicleId}/${Date.now()}_${fileName}`;
  const { error } = await supabase.storage
    .from(HANDOVER_ARCHIVE_BUCKET)
    .upload(path, blob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`storage upload failed: ${getSupabaseErrorMessage(error)}`);
  }

  const { data } = supabase.storage.from(HANDOVER_ARCHIVE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('failed to build public URL for uploaded PDF');
  }

  return data.publicUrl;
}

interface ArchivedHandoverResult {
  reportUrl: string;
  handover: {
    id: string;
    pdf_url: string;
    signature_url: string | null;
  };
}

export interface HandoverHistoryItem {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  handover_type: 'delivery' | 'return';
  handover_date: string;
  driver_label: string;
  vehicle_label: string;
  form_url: string | null;
  photo_urls: string[];
}

export function buildHandoverRecordUrl(vehicleId: string, handoverId: string) {
  return `${APP_BASE_URL}/vehicles/${vehicleId}#handover-${handoverId}`;
}

export function useHandovers(vehicleId?: string) {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? null;

  return useQuery({
    queryKey: ['handovers', vehicleId, orgId],
    enabled: orgId != null,
    queryFn: async () => {
      if (orgId == null) return [] as VehicleHandover[];
      let query = supabase
        .from('vehicle_handovers')
        .select('*, vehicle:vehicles(*), driver:drivers(*)')
        .eq('org_id', orgId)
        .order('handover_date', { ascending: false });
      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as VehicleHandover[];
    },
  });
}

export function useCreateHandover() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (handover: Omit<VehicleHandover, 'id' | 'created_at' | 'vehicle' | 'driver'>) => {
      const { data, error } = await supabase
        .from('vehicle_handovers')
        .insert(handover as any)
        .select()
        .single();

      if (!error) {
        return data;
      }

      const errorMessage = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
      const shouldRetryWithoutAssignmentMode =
        errorMessage.includes('assignment_mode') ||
        errorMessage.includes('column') ||
        errorMessage.includes('schema cache');

      if (!shouldRetryWithoutAssignmentMode) {
        throw error;
      }

      const { assignment_mode, ...fallbackPayload } = handover as any;
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('vehicle_handovers')
        .insert(fallbackPayload)
        .select()
        .single();

      if (fallbackError) throw fallbackError;
      return fallbackData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handovers'] });
      queryClient.invalidateQueries({ queryKey: ['handover-history'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['active-driver-vehicle-assignments'] });
    }
  });
}

export function useHandoverHistory() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? null;

  return useQuery({
    queryKey: ['handover-history', orgId],
    enabled: orgId != null,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (orgId == null) return [] as HandoverHistoryItem[];
      const handoversQuery = supabase
        .from('vehicle_handovers')
        .select('id, vehicle_id, driver_id, handover_type, handover_date, pdf_url, photo_front_url, photo_back_url, photo_right_url, photo_left_url, driver:drivers(full_name), vehicle:vehicles(manufacturer, model, plate_number)')
        .eq('org_id', orgId)
        .order('handover_date', { ascending: false })
        .limit(300);
      const { data: handoversData, error: handoversError } = await handoversQuery;

      if (handoversError) {
        console.warn('Handover history query failed:', handoversError.message);
        return [] as HandoverHistoryItem[];
      }

      const handovers = (handoversData ?? []) as any[];
      const handoverIds = handovers.map((handover) => handover.id);

      let docsByHandover = new Map<string, any>();

      if (handoverIds.length > 0) {
        const { data: docsData, error: docsError } = await supabase
          .from('vehicle_documents' as any)
          .select('handover_id, file_url, metadata, created_at')
          .in('handover_id', handoverIds)
          .order('created_at', { ascending: false });

        if (docsError) {
          console.warn('Vehicle documents query failed:', docsError.message);
        } else {
          docsByHandover = new Map(
            ((docsData as any[]) ?? [])
              .filter((doc) => !!doc.handover_id)
              .map((doc) => [doc.handover_id as string, doc])
          );
        }
      }

      return handovers.map((handover): HandoverHistoryItem => {
        const doc = docsByHandover.get(handover.id) ?? null;
        const metadataPhotoUrls = [
          doc?.metadata?.photoUrls?.front,
          doc?.metadata?.photoUrls?.back,
          doc?.metadata?.photoUrls?.right,
          doc?.metadata?.photoUrls?.left,
        ].filter(Boolean) as string[];

        const rowPhotoUrls = [
          handover.photo_front_url,
          handover.photo_back_url,
          handover.photo_right_url,
          handover.photo_left_url,
        ].filter(Boolean) as string[];

        const driverLabel = handover.driver?.full_name ?? 'ללא נהג';
        const vehicleLabel = handover.vehicle
          ? `${handover.vehicle.manufacturer} ${handover.vehicle.model} (${handover.vehicle.plate_number})`
          : 'ללא רכב';

        return {
          id: handover.id,
          vehicle_id: handover.vehicle_id,
          driver_id: handover.driver_id,
          handover_type: handover.handover_type,
          handover_date: handover.handover_date,
          driver_label: driverLabel,
          vehicle_label: vehicleLabel,
          form_url: doc?.file_url ?? handover.pdf_url ?? null,
          photo_urls: Array.from(new Set([...metadataPhotoUrls, ...rowPhotoUrls])),
        };
      });
    },
  });
}

interface ArchiveHandoverInput {
  handoverId: string;
  handoverType: 'delivery' | 'return';
  assignmentMode?: AssignmentMode;
  vehicleId: string;
  vehicleLabel: string;
  driverId: string | null;
  driverLabel: string;
  odometerReading: number;
  fuelLevel: number;
  notes: string | null;
  damageReport?: VehicleDamageReport;
  photoUrls: {
    front: string | null;
    back: string | null;
    right: string | null;
    left: string | null;
  };
  signatureUrl: string | null;
  createdBy: string | null;
  includeDriverArchive: boolean;
}

export async function archiveHandoverSubmission(input: ArchiveHandoverInput): Promise<ArchivedHandoverResult> {
  const hasDamage = input.damageReport ? hasAnyDamage(input.damageReport) : false;
  const notesDamageMatch = (input.notes ?? '').match(/דיווח נזקים:\s*([^|]+)/);
  const notesDamageSummary = notesDamageMatch?.[1]?.trim() ?? '';
  const damageSummary = hasDamage
    ? summarizeDamageReport(input.damageReport as VehicleDamageReport)
    : (notesDamageSummary || 'ללא נזקים');
  const timestamp = new Date().toISOString();
  const formBlob = await createPdfBlob([
    `מספר טופס: ${input.handoverId}`,
    `סוג טופס: ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'}`,
    `סוג מסירה: ${input.assignmentMode === 'replacement' ? 'חליפי' : 'קבוע'}`,
    `רכב: ${formatVehicleLabelForPdf(input.vehicleLabel)}`,
    `נהג: ${input.driverLabel}`,
    `קילומטראז': ${input.odometerReading.toLocaleString('he-IL')}`,
    `דלק: ${input.fuelLevel}/8`,
    `דיווח נזקים: ${damageSummary}`,
    `הערות: ${input.notes || 'ללא'}`,
    `זמן ביצוע: ${new Date(timestamp).toLocaleString('he-IL')}`,
  ], [
    { key: 'front', url: input.photoUrls.front },
    { key: 'back', url: input.photoUrls.back },
    { key: 'right', url: input.photoUrls.right },
    { key: 'left', url: input.photoUrls.left },
  ], input.signatureUrl, input.fuelLevel, input.damageReport);
  const fileName = `handover-forms/${input.vehicleId}/${Date.now()}_${input.handoverType}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(HANDOVER_ARCHIVE_BUCKET)
    .upload(fileName, formBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[archiveHandoverSubmission] Storage upload failed', {
      stage: 'storage.upload',
      bucket: HANDOVER_ARCHIVE_BUCKET,
      fileName,
      error: uploadError,
      message: getSupabaseErrorMessage(uploadError),
    });
    throw new Error(`Storage upload failed (${HANDOVER_ARCHIVE_BUCKET}): ${getSupabaseErrorMessage(uploadError)}`);
  }

  const { data: publicData } = supabase.storage
    .from(HANDOVER_ARCHIVE_BUCKET)
    .getPublicUrl(fileName);

  const reportUrl = publicData.publicUrl;

  if (!reportUrl) {
    console.error('[archiveHandoverSubmission] Public URL generation failed', {
      stage: 'storage.getPublicUrl',
      bucket: HANDOVER_ARCHIVE_BUCKET,
      fileName,
    });
    throw new Error('Failed to create handover form URL from storage');
  }

  const { error: vehicleDocError } = await supabase
    .from('vehicle_documents' as any)
    .insert({
      vehicle_id: input.vehicleId,
      title: `טופס ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'} - ${new Date().toLocaleDateString('he-IL')}`,
      file_url: reportUrl,
      handover_id: input.handoverId,
      document_type: input.handoverType,
      metadata: {
        assignmentMode: input.assignmentMode ?? 'permanent',
        photoUrls: input.photoUrls,
        signatureUrl: input.signatureUrl,
        damageReport: input.damageReport ?? null,
        damageSummary,
      },
    });

  if (vehicleDocError) {
    console.error('[archiveHandoverSubmission] vehicle_documents insert failed', {
      stage: 'db.insert.vehicle_documents',
      handoverId: input.handoverId,
      vehicleId: input.vehicleId,
      error: vehicleDocError,
      message: getSupabaseErrorMessage(vehicleDocError),
    });
    throw new Error(`vehicle_documents insert failed: ${getSupabaseErrorMessage(vehicleDocError)}`);
  }

  const { data: updatedHandover, error: handoverUpdateError } = await supabase
    .from('vehicle_handovers')
    .update({
      pdf_url: reportUrl,
      signature_url: input.signatureUrl,
    } as any)
    .eq('id', input.handoverId)
    .select('id, pdf_url, signature_url')
    .single();

  if (handoverUpdateError) {
    console.error('[archiveHandoverSubmission] vehicle_handovers update failed', {
      stage: 'db.update.vehicle_handovers',
      handoverId: input.handoverId,
      error: handoverUpdateError,
      message: getSupabaseErrorMessage(handoverUpdateError),
    });
    throw new Error(`vehicle_handovers update failed: ${getSupabaseErrorMessage(handoverUpdateError)}`);
  }

  // סנכרון שיוך נהג–רכב לכל הנהגים (כמו רועי מלאכי): מסירה פותחת שיוך, החזרה סוגרת מיד
  const { error: syncError } = await (supabase as any).rpc('sync_assignment_from_handover', {
    p_handover_id: input.handoverId,
  });
  if (syncError) {
    const msg = getSupabaseErrorMessage(syncError);
    console.warn('[archiveHandoverSubmission] sync_assignment_from_handover failed', {
      handoverId: input.handoverId,
      message: msg,
    });
    // Keep the flow resilient: UI toast must never crash archive/email flow.
    try {
      // שיוך רכב לנהג לא התעדכן — מציגים שגיאה כדי שידעו להריץ migration או לבדוק מצב מסירה (קבוע מול חליפי)
      toast.error('שיוך נהג–רכב לא עודכן', {
        description:
          msg +
          ' — מסירה קבועה בלבד יוצרת שיוך פעיל. מסירה חליפית נרשמת בהיסטורי בלבד. אם חסרה פונקציה sync_assignment_from_handover — הרץ migration.',
        duration: 14_000,
      });
    } catch (toastErr) {
      console.warn('[archiveHandoverSubmission] toast failed (non-blocking):', toastErr);
    }
  }
  // רענון שיוכים — הקרואים אחרי archive (דפי מסירה/החזרה) צריכים לקרוא invalidateQueries ל-active-driver-vehicle-assignments

  if (input.includeDriverArchive && input.driverId) {
    const { error: driverDocError } = await supabase
      .from('driver_documents')
      .insert({
        driver_id: input.driverId,
        title: `טופס ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'} - ${new Date().toLocaleDateString('he-IL')}`,
        file_url: reportUrl,
      });

    if (driverDocError) {
      console.error('[archiveHandoverSubmission] driver_documents insert failed', {
        stage: 'db.insert.driver_documents',
        handoverId: input.handoverId,
        driverId: input.driverId,
        error: driverDocError,
        message: getSupabaseErrorMessage(driverDocError),
      });
      // Non-blocking: handover archive is already saved in vehicle_documents.
      // Keep flow successful and allow follow-up DB fixes without blocking drivers.
    }
  }

  if (hasDamage && input.damageReport) {
    const location = DAMAGE_SIDES
      .filter((side) => input.damageReport?.[side]?.length)
      .map((side) => DAMAGE_SIDE_LABELS[side])
      .join(', ');

    const photoUrls = [
      input.photoUrls.front,
      input.photoUrls.back,
      input.photoUrls.right,
      input.photoUrls.left,
    ].filter(Boolean) as string[];

    const description = `דיווח נזק בעת ${input.handoverType === 'delivery' ? 'מסירה' : 'החזרה'}${input.assignmentMode === 'replacement' ? ' (רכב חליפי)' : ''}`;
    const notes = `מקור דיווח: טופס ${input.handoverId}`;

    const { error: vehicleIncidentError } = await (supabase as any)
      .from('vehicle_incidents')
      .insert({
        vehicle_id: input.vehicleId,
        incident_type: 'accident',
        incident_date: timestamp,
        description,
        location: location || null,
        driver_id: input.driverId,
        damage_desc: damageSummary,
        photo_urls: photoUrls.length ? photoUrls : null,
        police_report_no: null,
        insurance_claim: null,
        status: 'open',
        notes,
      });

    if (vehicleIncidentError) {
      console.warn('[archiveHandoverSubmission] vehicle_incidents insert failed', {
        handoverId: input.handoverId,
        message: getSupabaseErrorMessage(vehicleIncidentError),
      });
    }

    if (input.driverId) {
      const { error: driverIncidentError } = await (supabase as any)
        .from('driver_incidents')
        .insert({
          driver_id: input.driverId,
          vehicle_id: input.vehicleId,
          incident_type: 'accident',
          incident_date: timestamp,
          description,
          location: location || null,
          damage_desc: damageSummary,
          photo_urls: photoUrls.length ? photoUrls : null,
          police_report_no: null,
          insurance_claim: null,
          status: 'open',
          notes,
        });

      if (driverIncidentError) {
        console.warn('[archiveHandoverSubmission] driver_incidents insert failed', {
          handoverId: input.handoverId,
          message: getSupabaseErrorMessage(driverIncidentError),
        });
      }
    }
  }

  let persistedHandover: { id: string; pdf_url: string | null; signature_url: string | null } | null =
    (updatedHandover as { id: string; pdf_url: string | null; signature_url: string | null } | null) ?? null;
  let lastReadError: unknown = null;

  for (let attempt = 1; attempt <= 5 && !persistedHandover?.pdf_url; attempt += 1) {
    const { data, error } = await supabase
      .from('vehicle_handovers')
      .select('id, pdf_url, signature_url')
      .eq('id', input.handoverId)
      .single();

    if (error) {
      lastReadError = error;
      console.warn('[archiveHandoverSubmission] vehicle_handovers readback retry', {
        stage: 'db.select.vehicle_handovers',
        handoverId: input.handoverId,
        attempt,
        message: getSupabaseErrorMessage(error),
      });
    } else {
      persistedHandover = data as { id: string; pdf_url: string | null; signature_url: string | null };
      if (persistedHandover?.pdf_url) {
        break;
      }
      console.warn('[archiveHandoverSubmission] pdf_url still empty after update', {
        handoverId: input.handoverId,
        attempt,
      });
    }

    await delay(250 * attempt);
  }

  if (!persistedHandover?.pdf_url) {
    if (lastReadError) {
      console.error('[archiveHandoverSubmission] vehicle_handovers readback failed after retries', {
        stage: 'db.select.vehicle_handovers',
        handoverId: input.handoverId,
        message: getSupabaseErrorMessage(lastReadError),
      });
    }
    throw new Error('PDF copy failed: pdf_url was not persisted on handover record');
  }

  return {
    reportUrl: persistedHandover.pdf_url,
    handover: {
      id: persistedHandover.id,
      pdf_url: persistedHandover.pdf_url,
      signature_url: persistedHandover.signature_url,
    },
  };
}

interface SendHandoverEmailInput {
  handoverId: string;
  vehicleId: string;
  handoverType: 'delivery' | 'return';
  assignmentMode?: AssignmentMode;
  vehicleLabel: string;
  driverLabel: string;
  odometerReading: number;
  fuelLevel: number;
  notes: string | null;
  damageSummary?: string;
  receptionFormData?: {
    idNumber?: string;
    employeeNumber?: string;
    phone?: string;
    address?: string;
    ignitionCode?: string;
    accessoriesSummary?: string;
  };
  reportUrl: string;
  /** Extra files to attach alongside the PDF (wizard documents). */
  additionalAttachments?: { filename: string; url: string }[];
}

export async function sendHandoverNotificationEmail(input: SendHandoverEmailInput) {
  const toEmail = localStorage.getItem('handover_notification_email') || 'malachiroei@gmail.com';
  const hasReceptionAttachment = (input.additionalAttachments ?? []).some((file) => file.filename.includes('טופס קבלת רכב'));
  console.log('[sendHandoverNotificationEmail] reception attachment pushed', {
    hasReceptionAttachment,
    attachmentNames: (input.additionalAttachments ?? []).map((file) => file.filename),
  });
  const body = {
    to: toEmail,
    subject: `${input.handoverType === 'delivery' ? 'מסירת רכב' : 'החזרת רכב'} - ${input.vehicleLabel}`,
    payload: {
      ...input,
      recordUrl: buildHandoverRecordUrl(input.vehicleId, input.handoverId),
      sentAt: new Date().toISOString(),
      damageSummary: input.damageSummary ?? null,
      additionalAttachments: input.additionalAttachments ?? [],
    },
  };

  const { error, data } = await supabase.functions.invoke('send-handover-notification', { body });

  if (!error && !(data as any)?.error) {
    return;
  }

  // Log the most useful details we have before retrying/failing.
  try {
    console.error('[sendHandoverNotificationEmail] Edge function returned error', {
      sdkError: error ? { name: error.name, message: error.message } : null,
      data,
      to: toEmail,
      subject: body.subject,
      attachments: (input.additionalAttachments ?? []).map((f) => f.filename),
    });
  } catch {
    // non-blocking
  }

  // Some SDK versions may surface generic non-2xx errors even when the function is reachable.
  // Retry once via direct HTTPS call to capture a concrete response and avoid false negatives.
  try {
    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey() || getSupabasePublishableKey();
    if (!supabaseUrl || !anonKey) {
      throw new Error(
        `Missing Supabase URL/anon key for fallback call (url=${Boolean(supabaseUrl)}, anon/publishable=${Boolean(anonKey)}). Set VITE_* or NEXT_PUBLIC_* env on Vercel.`,
      );
    }
    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-handover-notification`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      try {
        console.error('[sendHandoverNotificationEmail] Edge function HTTP error', {
          status: response.status,
          statusText: response.statusText,
          body: text,
        });
      } catch {
        // non-blocking
      }
      throw new Error(`HTTP ${response.status}: ${text || 'response body is empty'}`);
    }

    if (text) {
      const parsed = JSON.parse(text);
      if (parsed?.error) {
        throw new Error(String(parsed.error));
      }
    }

    return;
  } catch (fallbackError) {
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    if (error) {
      const details = (() => {
        try {
          return JSON.stringify((error as any)?.context ?? {}, null, 0);
        } catch {
          return '';
        }
      })();
      throw new Error(`שליחת מייל נכשלה: ${error.message}${details ? ` | ${details}` : ''} | fallback: ${fallbackMessage}`);
    }
    if ((data as any)?.error) {
      throw new Error(`שליחת מייל נכשלה: ${(data as any).error} | fallback: ${fallbackMessage}`);
    }
    throw new Error(`שליחת מייל נכשלה: ${fallbackMessage}`);
  }
}

export function useLatestHandover(vehicleId: string) {
  return useQuery({
    queryKey: ['latest-handover', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_handovers')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('handover_date', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as VehicleHandover | null;
    },
    enabled: !!vehicleId
  });
}

// Upload image with compression
export async function uploadHandoverPhoto(
  file: File, 
  vehicleId: string, 
  photoType: 'front' | 'back' | 'right' | 'left'
): Promise<string> {
  // Compress image before upload
  const compressedFile = await compressImage(file);
  
  const fileName = `${vehicleId}/${Date.now()}_${photoType}.jpg`;
  
  const { error } = await supabase.storage
    .from(HANDOVER_PHOTOS_BUCKET)
    .upload(fileName, compressedFile, {
      contentType: 'image/jpeg',
      upsert: true
    });
  
  if (error) throw error;
  
  const { data } = supabase.storage
    .from(HANDOVER_PHOTOS_BUCKET)
    .getPublicUrl(fileName);
  
  return data.publicUrl;
}

// Image compression utility
async function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// Upload signature
export async function uploadSignature(
  dataUrl: string, 
  vehicleId: string,
  handoverType: 'delivery' | 'return'
): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  
  const fileName = `${vehicleId}/${Date.now()}_signature_${handoverType}.png`;
  
  const { error } = await supabase.storage
    .from(HANDOVER_PHOTOS_BUCKET)
    .upload(fileName, blob, {
      contentType: 'image/png',
      upsert: true
    });
  
  if (error) throw error;
  
  const { data } = supabase.storage
    .from(HANDOVER_PHOTOS_BUCKET)
    .getPublicUrl(fileName);
  
  return data.publicUrl;
}
