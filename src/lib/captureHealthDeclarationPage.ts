import html2canvas from 'html2canvas';

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
    });
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    slot.innerHTML = '';
  }
}
