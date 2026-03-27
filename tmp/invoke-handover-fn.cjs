const fs = require('fs');

function readEnvFile(name) {
  try {
    return fs.readFileSync(name, 'utf8');
  } catch {
    return '';
  }
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        if (idx === -1) return null;
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).replace(/^"|"$/g, '').trim();
        return [key, val];
      })
      .filter(Boolean)
  );
}

const merged = {
  ...parseEnv(readEnvFile('.env')),
  ...parseEnv(readEnvFile('.env.local')),
};

const base = (merged.NEXT_PUBLIC_SUPABASE_URL || merged.VITE_SUPABASE_URL || '').replace(/\/$/, '');
if (!base) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL in .env.local or .env');
  process.exit(1);
}

const url = `${base}/functions/v1/send-handover-notification`;
const anonOrPublishable =
  merged.VITE_SUPABASE_PUBLISHABLE_KEY ||
  merged.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  merged.VITE_SUPABASE_ANON_KEY ||
  '';

if (!anonOrPublishable) {
  console.error(
    'Set VITE_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local'
  );
  process.exit(1);
}

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
      apikey: anonOrPublishable,
      Authorization: `Bearer ${anonOrPublishable}`,
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
