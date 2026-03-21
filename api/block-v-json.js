/**
 * Vercel Edge: /v.json ו-/v-dev-only.json ב-host ייצור → 404 (מניפסט טסט רק מחוץ ל-pro).
 */
export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(
    JSON.stringify({
      error: 'Not Found',
      message: 'Static version manifests are not served on fleet-manager-pro.com',
    }),
    {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Fleet-Vercel-Block': 'v-json',
      },
    }
  );
}
