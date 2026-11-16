// Pubblica dist/ su Firebase Hosting via REST API (niente firebase-tools / login interattivo).
// Token: env FIRESTORE_TOKEN (GitHub Actions) oppure gcloud dell'account indicato.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { accountFlag } from './local.mjs';

const SITE = process.env.HOSTING_SITE || 'milano-city-championship';
const PROJECT = process.env.FIREBASE_PROJECT || 'my-project-1516274864079';
const DIST = new URL('../dist', import.meta.url).pathname;
const API = 'https://firebasehosting.googleapis.com/v1beta1';
const token = process.env.FIRESTORE_TOKEN || execSync(`gcloud auth print-access-token ${accountFlag()}`).toString().trim();
const H = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

const version = await call('POST', `${API}/sites/${SITE}/versions`, {
  config: {
    rewrites: [{ glob: '**', path: '/index.html' }],
    // pagine, service worker, manifest e immagini di anteprima: sempre ricontrollati (nessuna versione vecchia);
    // solo i file con hash nel nome (/assets/) restano in cache a lungo.
    headers: [
      { glob: '**', headers: { 'Cache-Control': 'no-cache',
        // sicurezza: niente incorporamento in altri siti, niente sniffing, referrer minimo, nessun permesso hardware
        'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } },
      { glob: '/assets/**', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
      { glob: '/@(brand|logos|icons)/**', headers: { 'Cache-Control': 'public, max-age=604800' } },
      { glob: '/qr-installa.svg', headers: { 'Cache-Control': 'public, max-age=604800' } },
    ],
  },
});
const files = {}; const blobs = {};
for (const p of walk(DIST)) {
  const gz = gzipSync(readFileSync(p), { level: 9 });
  const hash = createHash('sha256').update(gz).digest('hex');
  files[`/${relative(DIST, p)}`] = hash; blobs[hash] = gz;
}
const pop = await call('POST', `${API}/${version.name}:populateFiles`, { files });
for (const h of pop.uploadRequiredHashes || []) {
  const res = await fetch(`${pop.uploadUrl}/${h}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/octet-stream' }, body: blobs[h] });
  if (!res.ok) throw new Error(`upload ${h} → ${res.status} ${await res.text()}`);
}
await call('PATCH', `${API}/${version.name}?update_mask=status`, { status: 'FINALIZED' });
await call('POST', `${API}/sites/${SITE}/releases?versionName=${encodeURIComponent(version.name)}`, { message: 'deploy mcc-app' });
console.log(`Deploy OK: ${Object.keys(files).length} file → https://${SITE}.web.app`);
