// Esporta la collezione h2h in e2e/h2h.json per i test locali (non pubblicato, non committato)
import { writeFileSync } from 'node:fs';
import { readDoc } from './read-doc.mjs';
const docs = { meta: await readDoc('h2h/meta'), standings: await readDoc('h2h/standings'), matchdays: [] };
for (let n = 1; n <= 63; n++) { const d = await readDoc(`h2h/md_${n}`); if (d.number) docs.matchdays.push(d); }
writeFileSync(new URL('../e2e/h2h.json', import.meta.url), JSON.stringify(docs));
console.log('fixture h2h:', docs.matchdays.length, 'giornate');
