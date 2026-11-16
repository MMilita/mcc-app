// Legge un documento Firestore e lo stampa come JSON normale (strumento di sviluppo)
import { execSync } from 'node:child_process';
import { accountFlag } from './local.mjs';
const P = 'my-project-1516274864079';
const t = execSync(`gcloud auth print-access-token ${accountFlag()}`).toString().trim();
const dec = (v) => {
  if (!v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  return Object.values(v)[0];
};
export async function readDoc(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${t}`, 'x-goog-user-project': P } });
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, x]) => [k, dec(x)]));
}
if (process.argv[2]) console.log(JSON.stringify(await readDoc(process.argv[2]), null, 1));
