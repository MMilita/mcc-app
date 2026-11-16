// Imposta il campo logo delle franchigie senza toccare gli altri dati (rose modificate dal Commissioner ecc.)
import { readFileSync } from 'node:fs';
import { patch } from './firestore.mjs';
const logos = JSON.parse(readFileSync(new URL('../seed/logos.json', import.meta.url)));
for (const [id, logo] of Object.entries(logos)) await patch(`franchises/${id}`, { logo });
console.log(`Loghi impostati: ${Object.keys(logos).length}`);
