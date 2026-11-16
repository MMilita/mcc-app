// Sincronizza dalla lega Draft Dunkest "Milano City Championship" (torneo testa a testa):
// calendario e risultati di ogni giornata, classifica, formazioni schierate da ogni franchigia.
// Richiede DUNKEST_TOKEN (segreto GitHub impostato dal proprietario dell'account Dunkest).
// Senza token esce senza errori: il resto del sync continua a funzionare.
import { commit, listDocs } from './firestore.mjs';
import { scoreTeam } from '../src/lib/appscore.js';
import { keyOf } from '../src/lib/cap.js';
import { normTeam } from '../src/lib/names.js';

const TOKEN = process.env.DUNKEST_TOKEN;
const TOURNAMENT = process.env.DUNKEST_TOURNAMENT_ID || '236671';
const LEAGUE = process.env.DUNKEST_DRAFT_LEAGUE_ID || '155535';
const API = 'https://fantaking-api.dunkest.com/api/v1';
const ONLY_CURRENT = process.env.H2H_ONLY_CURRENT === 'true'; // durante le partite: solo la giornata in corso

// tollera virgolette, spazi, a capo e il prefisso "Bearer " copiati per errore
const CLEAN = String(TOKEN || '').trim().replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '').trim();
if (!TOKEN) { console.log('H2H: DUNKEST_TOKEN non impostato, salto.'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path) {
  const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${CLEAN}`, Accept: 'application/json', 'User-Agent': 'mcc-fantanba-sync/1.2' } });
  if (res.status === 401) throw new Error(`DUNKEST_TOKEN scaduto o non valido (401): va rigenerato [lunghezza ${CLEAN.length}, formato ${/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(CLEAN) ? 'JWT corretto' : 'NON è un token JWT'}]`);
  if (!res.ok) return { _error: res.status, _path: path };
  const j = await res.json();
  await sleep(250); // gentili con l'API
  return j.data ?? j;
}

// Firestore accetta solo mappe/array "puliti": niente undefined, chiavi non vuote
const clean = (v) => JSON.parse(JSON.stringify(v ?? null));

async function main() {
  const cfg = (await (await fetch(`${API}/leagues/1/config`)).json()).data;
  const current = cfg.current_matchday;
  const played = cfg.matchdays.filter((m) => m.number <= current.number);
  const upcoming = cfg.matchdays.filter((m) => m.number > current.number);
  const targets = ONLY_CURRENT ? played.filter((m) => m.id === current.id) : cfg.matchdays;

  // dati per il punteggio calcolato dall'app (formazioni salvate sull'app + punti esatti Dunkest)
  const franchises = await listDocs('franchises');
  const histories = {};
  for (const f of franchises) histories[f.id] = await listDocs(`lineups/${f.id}/history`).catch(() => []);
  const playerTeam = {};
  for (const c of (await listDocs('players')).filter((d) => d.id.startsWith('chunk_'))) for (const p of c.players || []) playerTeam[keyOf(p.name)] = p.team;
  const fidByTeam = Object.fromEntries(franchises.map((f) => [normTeam(f.name), f.id]));
  const usingApp = franchises.filter((f) => histories[f.id].length);

  const docs = [];
  const tournament = await api(`tournaments/${TOURNAMENT}`);
  const league = await api(`fantasy-leagues/${LEAGUE}`);
  docs.push({ path: 'h2h/meta', data: { updatedAt: new Date(), tournamentId: TOURNAMENT, leagueId: LEAGUE, currentMatchday: current.number, tournament: clean(tournament), league: clean(league) } });

  const standings = await api(`tournaments/${TOURNAMENT}/standings?matchday=${current.id}`);
  const overall = await api(`tournaments/${TOURNAMENT}/standings`);
  docs.push({ path: 'h2h/standings', data: { updatedAt: new Date(), matchday: current.number, raw: clean(standings), overall: clean(overall) } });

  for (const md of targets) {
    const matches = await api(`tournaments/${TOURNAMENT}/matchdays/${md.id}/fantasy-matches`);
    const isPast = md.number <= current.number;
    // dettaglio di ogni partita giocata: formazioni di entrambe le squadre con i punti dei giocatori
    const details = {};
    if (isPast && Array.isArray(matches)) {
      for (const m of matches) details[String(m.id)] = clean(await api(`fantasy-matches/${m.id}?lang=it`));
    }
    // punteggio app: solo per le franchigie che hanno salvato formazioni sull'app
    let app = null;
    if (isPast && usingApp.length && Object.keys(details).length) {
      const sched = await fetch(`${API}/schedules/${cfg.current_schedule_id}/matchdays/${md.id}`).then((r) => r.json()).then((j) => j.data).catch(() => null);
      const starts = {};
      for (const r of sched?.rounds || []) for (const m of r.matches || []) for (const t of [m.home_team?.abbreviation, m.away_team?.abbreviation]) if (t) starts[t] = Math.min(starts[t] ?? Infinity, new Date(m.started_at).getTime());
      const all = Object.values(starts);
      const win = { start: Math.min(...all), end: Math.max(...all) + 4 * 3600 * 1000 };
      const pts = {};
      for (const det of Object.values(details)) for (const side of ['home_team', 'away_team']) for (const g of ['starters', 'bench', 'reserve']) for (const p of det?.[side]?.players?.[g] || []) pts[keyOf(`${p.first_name} ${p.last_name}`)] = p.pts;
      app = { teams: {}, matches: {} };
      for (const f of usingApp) {
        const r = scoreTeam({
          versions: histories[f.id],
          startOf: (name) => { const t = playerTeam[keyOf(name)]; return t ? (starts[t] ?? win.start) : win.start; },
          ptsOf: (name) => pts[keyOf(name)] ?? null,
          window: win,
        });
        if (r) app.teams[f.id] = r;
      }
      for (const m of matches || []) {
        const h = fidByTeam[normTeam(m.home_team?.name || '')]; const a = fidByTeam[normTeam(m.away_team?.name || '')];
        app.matches[String(m.id)] = { home: app.teams[h]?.score ?? null, away: app.teams[a]?.score ?? null };
      }
    }
    docs.push({ path: `h2h/md_${md.number}`, data: { number: md.number, matchdayId: md.id, past: isPast, updatedAt: new Date(), matches: clean(matches), details, app: clean(app) } });
  }
  // riepilogo pubblico per la landing: classifica generale + partite della giornata corrente e della prossima
  const mdDoc = (n) => docs.find((d) => d.path === `h2h/md_${n}`)?.data;
  const slim = (ms) => (Array.isArray(ms) ? ms.map((m) => ({ id: m.id, home: m.home_team?.name, hs: m.home_team?.pts ?? null, away: m.away_team?.name, as: m.away_team?.pts ?? null, winner: m.winner_id === m.home_team?.id ? 'home' : m.winner_id === m.away_team?.id ? 'away' : null })) : []);
  if (Array.isArray(overall)) {
    const cur = mdDoc(current.number);
    const nxt = mdDoc(current.number + 1);
    docs.push({
      path: 'league/h2h_public',
      data: {
        updatedAt: new Date(),
        matchday: current.number,
        standings: overall.map((r) => ({ team: r.name, w: r.wins ?? 0, l: r.losses ?? 0, fpt: r.total_pts ?? 0, position: r.position })),
        current: cur ? slim(cur.matches) : null,
        next: nxt ? slim(nxt.matches) : null,
      },
    });
  }
  await commit(docs);
  console.log(`H2H OK: ${targets.length} giornate (${played.length} giocate, ${upcoming.length} future), classifica G${current.number}`);
}

main().catch((e) => { console.error('H2H errore:', e.message); process.exit(1); });
