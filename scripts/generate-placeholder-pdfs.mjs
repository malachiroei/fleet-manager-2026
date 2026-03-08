import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';

const outputDir = path.resolve('public/forms-files');

const files = [
  { name: 'form-practical-test.pdf', text: 'Practical Driving Test Form' },
  { name: 'family-health-declaration.pdf', text: 'Family Health Declaration Form' },
  { name: 'vehicle-upgrade-request.pdf', text: 'Vehicle Upgrade Request Form' },
  { name: 'vehicle-delivery-form.pdf', text: 'Vehicle Delivery Form' },
  { name: 'vehicle-return-form.pdf', text: 'Vehicle Return Form' },
  { name: 'personal-details-update.pdf', text: 'Personal Details Update Form' },
  { name: 'family-authorized-driver.pdf', text: 'Authorized Family Driver Form' },
  { name: 'exception-travel-approval.pdf', text: 'Exception Travel Approval Form' },
  { name: 'near-accident-report.pdf', text: 'Near Accident Report Form' },
  { name: 'driver-privacy-declaration.pdf', text: 'Driver Privacy Declaration Form' },
];

fs.mkdirSync(outputDir, { recursive: true });
for (const file of files) {
  const target = path.join(outputDir, file.name);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Fleet Manager Forms Center', 40, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text(file.text, 40, 130);
  doc.setFontSize(12);
  doc.text('Placeholder content. Upload the final scanned PDF to replace this file.', 40, 170);
  const pdfBytes = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(target, pdfBytes);
}

console.log(`Generated ${files.length} placeholder PDFs in ${outputDir}`);
