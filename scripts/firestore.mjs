// Helper minimale per scrivere su Firestore via REST, senza service account key.
// Token: env FIRESTORE_TOKEN (es. dalla GitHub Action con Workload Identity)
// oppure `gcloud auth print-access-token --account=$GCLOUD_ACCOUNT` in locale.
import { execSync } from 'node:child_process';
import { accountFlag } from './local.mjs';

export const PROJECT = process.env.FIREBASE_PROJECT || 'my-project-1516274864079';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function token() {
  if (process.env.FIRESTORE_TOKEN) return process.env.FIRESTORE_TOKEN;
  return execSync(`gcloud auth print-access-token ${accountFlag()}`).toString().trim();
}

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}

export function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

// docs: [{ path: 'collection/doc', data: {...} }]  — sovrascrive interamente ogni documento
// Le scritture vanno in blocchi da max 400 documenti e ~200 KB (oltre, Firestore risponde 429 "maximum bandwidth
// for writes"); su 429/503 si riprova con attesa crescente.
export async function commit(docs) {
  const t = token();
  const writes = docs.map(({ path, data }) => ({
    update: { name: `projects/${PROJECT}/databases/(default)/documents/${path}`, fields: toFields(data) },
  }));
  const batches = []; let cur = []; let size = 0;
  for (const w of writes) {
    const s = JSON.stringify(w).length;
    if (cur.length && (cur.length >= 400 || size + s > 200_000)) { batches.push(cur); cur = []; size = 0; }
    cur.push(w); size += s;
  }
  if (cur.length) batches.push(cur);
  for (const batch of batches) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${BASE}:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT },
        body: JSON.stringify({ writes: batch }),
      });
      if (res.ok) break;
      const body = await res.text();
      if ((res.status === 429 || res.status === 503) && attempt < 7) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
      throw new Error(`Firestore commit ${res.status}: ${body}`);
    }
    if (batches.length > 1) await new Promise((r) => setTimeout(r, 300));
  }
  return docs.length;
}

// aggiorna solo i campi indicati (non sovrascrive il resto del documento)
export async function patch(path, data) {
  const t = token();
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const res = await fetch(`${BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore patch ${res.status}: ${await res.text()}`);
}

const decode = (v) => {
  if (!v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('nullValue' in v) return null;
  return Object.values(v)[0];
};
// elenca i documenti di una collezione (anche sotto-collezione) -> [{ id, ...campi }]
export async function listDocs(path) {
  const t = token(); const out = []; let pageToken = '';
  do {
    const res = await fetch(`${BASE}/${path}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: { Authorization: `Bearer ${t}`, 'x-goog-user-project': PROJECT } });
    if (!res.ok) throw new Error(`Firestore list ${path} ${res.status}: ${await res.text()}`);
    const j = await res.json();
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, decode(x)])) });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

// legge un documento -> oggetto semplice (null se non esiste)
export async function getDocData(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token()}`, 'x-goog-user-project': PROJECT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get ${path} ${res.status}`);
  const j = await res.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, x]) => [k, decode(x)]));
}
