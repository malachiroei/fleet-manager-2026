const fs = require('fs');

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1).replace(/^\"|\"$/g, '')];
    })
);

const url = 'https://cesstoohvlbvyreznwqd.supabase.co/functions/v1/send-handover-notification';
const body = {
  to: 'malachiroei@gmail.com',
  subject: 'בדיקת מייל',
  payload: {
    handoverId: '12345678-1234-1234-1234-123456789012',
    handoverType: 'delivery',
    assignmentMode: 'replacement',
    vehicleLabel: 'בדיקה',
    driverLabel: 'בדיקה',
    odometerReading: 1,
    fuelLevel: 1,
    notes: 'בדיקה',
    damageSummary: 'קדימה: מכה',
    reportUrl: 'https://example.com/test.pdf',
    sentAt: new Date().toISOString(),
  },
};

async function main() {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  console.log('status:', resp.status);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
