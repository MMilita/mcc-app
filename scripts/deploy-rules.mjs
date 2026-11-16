// Pubblica firestore.rules via REST (firebaserules API)
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { accountFlag } from './local.mjs';
const PROJECT = process.env.FIREBASE_PROJECT || 'my-project-1516274864079';
const token = process.env.FIRESTORE_TOKEN || execSync(`gcloud auth print-access-token ${accountFlag()}`).toString().trim();
const H = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };
const API = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;
const content = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const rs = await (await fetch(`${API}/rulesets`, { method: 'POST', headers: H, body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content }] } }) })).json();
if (!rs.name) throw new Error(JSON.stringify(rs));
const rel = await fetch(`${API}/releases/cloud.firestore`, { method: 'PATCH', headers: H, body: JSON.stringify({ release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: rs.name } }) });
if (!rel.ok) throw new Error(await rel.text());
console.log('Regole pubblicate:', rs.name);
