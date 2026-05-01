import html2canvas from 'html2canvas';

/**
 * html2canvas 1.x לא יודע לפרק `oklch()` (Tailwind v4). מאלץ צבעי hex על העותק המשוכפל.
 */
function sanitizeCloneForHtml2Canvas(clonedDoc: Document): void {
  const root = clonedDoc.querySelector('[data-health-print-root]');
  if (!root) return;

  const visit = (el: Element) => {
    if (el instanceof HTMLElement) {
      if (el.tagName === 'IMG' || el.tagName === 'CANVAS') {
        el.style.setProperty('background-color', 'transparent', 'important');
      } else {
        const isRoot = el === root;
        el.style.setProperty('color', '#000000', 'important');
        el.style.setProperty('background-color', isRoot ? '#ffffff' : 'transparent', 'important');
        el.style.setProperty('border-color', '#cbd5e1', 'important');
        el.style.setProperty('box-shadow', 'none', 'important');
        el.style.setProperty('outline', 'none', 'important');
      }
    }
    Array.from(el.children).forEach(visit);
  };
  visit(root);
}

/**
 * ממזער את נוסח ההצהרה + תמונת חתימה לתמונת JPEG אחת (לשמירה ב־URL הנהג).
 */
export async function captureHealthDeclarationFullPage(
  root: HTMLElement,
  signatureDataUrl: string,
): Promise<string> {
  const slot = root.querySelector('[data-health-sig-slot]');
  if (!slot) throw new Error('חסר מיקום חתימה במסמך');

  slot.innerHTML = '';
  const img = document.createElement('img');
  img.src = signatureDataUrl;
  img.alt = '';
  img.style.maxHeight = '160px';
  img.style.width = 'auto';
  slot.appendChild(img);

  try {
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        sanitizeCloneForHtml2Canvas(clonedDoc);
      },
    });
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    slot.innerHTML = '';
  }
}
