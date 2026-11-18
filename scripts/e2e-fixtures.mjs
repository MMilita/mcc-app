// Esporta h2h e mccstats in e2e/*.json per i test locali (non pubblicati, non committati)
import { writeFileSync } from 'node:fs';
import { readDoc } from './read-doc.mjs';
const docs = { meta: await readDoc('h2h/meta'), standings: await readDoc('h2h/standings'), matchdays: [] };
for (let n = 1; n <= 63; n++) { const d = await readDoc(`h2h/md_${n}`); if (d.number) docs.matchdays.push(d); }
writeFileSync(new URL('../e2e/h2h.json', import.meta.url), JSON.stringify(docs));
console.log('fixture h2h:', docs.matchdays.length, 'giornate');

// motore MCC: meta, stagione, infortuni, giornate e giorni elaborati
const mcc = {};
for (const id of ['meta', 'season', 'injuries']) mcc[id] = await readDoc(`mccstats/${id}`);
for (const n of Object.keys(mcc.meta.mds || {})) mcc[`md_${n}`] = await readDoc(`mccstats/md_${n}`);
for (const d of Object.keys(mcc.meta.days || {})) mcc[`day_${d}`] = await readDoc(`mccstats/day_${d}`);
writeFileSync(new URL('../e2e/mccstats.json', import.meta.url), JSON.stringify(mcc));
console.log('fixture mccstats:', Object.keys(mcc).length, 'documenti');
