// Carica su Firestore i dati iniziali della lega (franchigie, record, classifica, config).
// Uso: npm run seed   (usa il token gcloud dell'account indicato in .local.json)
import { readFileSync } from 'node:fs';
import { commit } from './firestore.mjs';
import { local } from './local.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../seed/${f}`, import.meta.url)));
const franchises = read('franchises.json');
const records = read('records.json');
const standings = read('standings.json');

const docs = [
  ...franchises.map((f) => ({ path: `franchises/${f.id}`, data: f })),
  { path: 'league/records', data: records },
  { path: 'league/standings', data: standings },
  {
    path: 'config/app',
    data: {
      season: '2026/27',
      currentSeasonKey: '2026/2027',
      salaryCap: 120,
      apron: 150,
      showGM: true,
      heroTitle: 'Milano City Championship',
      heroSubtitle: 'Il FantaNBA dei quartieri di Milano. 16 franchigie, dal 2016.',
      announcements: [
        { date: '2026-11-16', text: 'Nuova app MCC: formazioni, rose, contratti e statistiche Dunkest in un unico posto.' },
      ],
      lineupDeadline: null,
      matchday: 10,
      round: '3/3',
    },
  },
  { path: 'config/admins', data: { emails: local.admins || [] } },
];

const count = await commit(docs);
console.log(`Seed OK: ${count} documenti`);
