# MCC · Milano City Championship

Web app + PWA del FantaNBA Milano City Championship (React + Vite, Firebase Spark: Hosting, Auth Google, Firestore).

- `/` landing pubblica (classifica, franchigie, albo d'oro, premi, record)
- `/app` app dei GM (formazione stile Dunkest, rose e contratti, giocatori, lega) — installabile come PWA
- `/admin` dashboard del Commissioner

## Dati
- Contratti e franchigie: `seed/` (generati da `scripts/build_seed.py` dai fogli della lega) → `npm run seed`
- Giocatori: API pubblica statistiche Dunkest → `npm run sync` (GitHub Actions 2 volte al giorno)

## Deploy
`npm run build && node scripts/deploy-hosting.mjs` (anche automatico a ogni push su `main`).
Nessuna chiave salvata: GitHub Actions si autentica a Google con Workload Identity Federation.
