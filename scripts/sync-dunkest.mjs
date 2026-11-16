// Sincronizza da Dunkest (solo API pubbliche, nessun login):
//  - giocatori: crediti, PDK e medie stagionali  → players/chunk_N + players/meta
//  - calendario della giornata in corso (turni, partite, orari, risultati) e
//    punti Dunkest di ogni giocatore per turno      → league/live
// Gira da GitHub Actions (vedi .github/workflows/sync.yml).
import { commit } from './firestore.mjs';

const SEASON_ID = process.env.DUNKEST_SEASON_ID || '29'; // NBA 2026/27 (stats dunkest.com)
const LEAGUE_ID = 1; // NBA su fantaking-api
const CHUNK = 120;
const UA = { 'User-Agent': 'mcc-fantanba-sync/1.1' };
const API = 'https://fantaking-api.dunkest.com/api/v1';

const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

function statsUrl(extra = {}) {
  const p = new URLSearchParams({
    season_id: SEASON_ID, mode: 'nba', stats_type: 'avg', date_from: '2026-10-01', date_to: '2027-06-30',
    player_search: '', min_cr: '0', max_cr: '50', sort_by: 'pdk', sort_order: 'desc', ...extra,
  });
  for (let t = 1; t <= 30; t++) p.append('teams[]', String(t));
  for (const pos of ['1', '2', '3']) p.append('positions[]', pos);
  return p;
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// numeri di maglia dai roster pubblici ESPN (1 chiamata per squadra, solo nel sync giornaliero)
const norm = (s = '') => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
async function jerseyNumbers() {
  const out = {};
  try {
    const teams = (await getJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams')).sports[0].leagues[0].teams;
    for (const { team } of teams) {
      const r = await getJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}/roster`).catch(() => null);
      for (const a of r?.athletes || []) if (a.jersey) out[norm(a.fullName)] = String(a.jersey);
    }
  } catch (e) { console.warn('ESPN roster non disponibile:', e.message); }
  return out;
}

async function syncPlayers() {
  const jerseys = await jerseyNumbers();
  const raw = await getJson(`https://www.dunkest.com/api/stats/table?${statsUrl()}`);
  if (!Array.isArray(raw) || raw.length < 100) throw new Error(`Risposta inattesa: ${raw.length} giocatori`);
  const players = raw.map((p) => ({
    id: Number(p.id), name: `${p.first_name} ${p.last_name}`.trim(), first: p.first_name, last: p.last_name,
    team: p.team_code, pos: { G: 'G', F: 'A', C: 'C' }[p.position] || p.position,
    cr: n(p.cr), pdk: n(p.pdk), gp: n(p.gp), gs: n(p.starter), min: n(p.min), pts: n(p.pts), reb: n(p.reb),
    oreb: n(p.oreb), ast: n(p.ast), stl: n(p.stl), blk: n(p.blk), tov: n(p.tov), fgp: n(p.fgp), tpp: n(p.tpp),
    ftp: n(p.ftp), pm: n(p.plus_minus), slug: p.slug,
    num: jerseys[norm(`${p.first_name} ${p.last_name}`)] || null,
  }));
  const docs = [];
  for (let i = 0; i < players.length; i += CHUNK) docs.push({ path: `players/chunk_${i / CHUNK}`, data: { players: players.slice(i, i + CHUNK) } });
  docs.push({ path: 'players/meta', data: { updatedAt: new Date(), count: players.length, chunks: docs.length, source: 'dunkest.com/api/stats/table', seasonId: SEASON_ID } });
  return docs;
}

function mapSchedule(md) {
  return {
    id: md.id,
    number: md.number,
    rounds: (md.rounds || []).map((r) => ({
      id: r.id,
      number: r.number,
      matches: (r.matches || []).map((m) => ({
        id: m.id, status: m.status, ot: !!m.ot, startedAt: m.started_at,
        home: m.home_team?.abbreviation, away: m.away_team?.abbreviation,
        hs: m.home_team?.score ?? null, as: m.away_team?.score ?? null,
      })),
    })),
  };
}

async function syncLive() {
  const cfg = (await getJson(`${API}/leagues/${LEAGUE_ID}/config`)).data;
  const statusName = { 1: 'trades_open', 2: 'matches_in_progress', 3: 'substitutions_open', 4: 'calculation_in_progress', 5: 'matchday_ended', 6: 'inactive' }[cfg.status_id] || 'unknown';
  const scheduleId = cfg.current_schedule_id;
  const cur = cfg.current_matchday;
  const idx = cfg.matchdays.findIndex((m) => m.id === cur.id);
  const next = cfg.matchdays[idx + 1];
  const current = mapSchedule((await getJson(`${API}/schedules/${scheduleId}/matchdays/${cur.id}`)).data);
  const upcoming = next ? mapSchedule((await getJson(`${API}/schedules/${scheduleId}/matchdays/${next.id}`)).data) : null;

  // punti Dunkest per giocatore e per turno della giornata corrente (solo turni già iniziati)
  const points = {};
  const now = Date.now();
  for (const r of current.rounds) {
    const started = r.matches.some((m) => new Date(m.startedAt).getTime() <= now);
    if (!started) continue;
    const p = statsUrl({ mode: 'dunkest' });
    p.append('weeks[]', String(current.number));
    p.append('rounds[]', String(r.number));
    const rows = await getJson(`https://www.dunkest.com/api/stats/table?${p}`);
    for (const row of rows) {
      const id = String(row.id);
      points[id] = points[id] || {};
      points[id][`r${r.number}`] = n(row.pdk);
    }
  }
  return [{
    path: 'league/live',
    data: {
      updatedAt: new Date(),
      status: statusName,
      matchday: { id: cur.id, number: cur.number, numRounds: cur.num_rounds },
      round: cfg.current_round ? { id: cfg.current_round.id, number: cfg.current_round.number, startedAt: cfg.current_round.started_at } : null,
      matchdays: cfg.matchdays.map((m) => ({ id: m.id, number: m.number })),
      schedule: current,
      next: upcoming,
      points,
    },
  }];
}

// Storico partita per partita di ogni giocatore (punti Dunkest e statistiche per turno) -> playerlog/c0..c7
// Una riga = [giornata, turno, pdk, min, pts, reb, ast, stl, blk, tov, avversario, casa(1/0), inizio(ms)]
async function syncLogs() {
  const cfg = (await getJson(`${API}/leagues/${LEAGUE_ID}/config`)).data;
  const now = Date.now();
  const logs = {};
  for (const md of cfg.matchdays.filter((m) => m.number <= cfg.current_matchday.number)) {
    const sched = (await getJson(`${API}/schedules/${cfg.current_schedule_id}/matchdays/${md.id}`)).data;
    for (const r of sched.rounds || []) {
      const started = (r.matches || []).filter((m) => new Date(m.started_at).getTime() <= now);
      if (!started.length) continue;
      const opp = {};
      for (const m of r.matches) {
        const t = new Date(m.started_at).getTime();
        opp[m.home_team.abbreviation] = [m.away_team.abbreviation, 1, t];
        opp[m.away_team.abbreviation] = [m.home_team.abbreviation, 0, t];
      }
      const p = statsUrl({ mode: 'dunkest' });
      p.append('weeks[]', String(md.number)); p.append('rounds[]', String(r.number));
      const rows = await getJson(`https://www.dunkest.com/api/stats/table?${p}`);
      for (const row of rows) {
        const o = opp[row.team_code] || ['', 0, 0];
        (logs[row.id] ||= []).push([md.number, r.number, n(row.pdk), n(row.min), n(row.pts), n(row.reb), n(row.ast), n(row.stl), n(row.blk), n(row.tov), o[0], o[1], o[2]]);
      }
    }
  }
  const chunks = Array.from({ length: 8 }, () => ({}));
  for (const [id, games] of Object.entries(logs)) chunks[Number(id) % 8][id] = games.map((g) => g.join('|'));
  return chunks.map((c, i) => ({ path: `playerlog/c${i}`, data: { updatedAt: new Date(), logs: c } }));
}

async function main() {
  // SYNC_PLAYERS=false → solo punti live e calendario (1 documento): usato ogni 15' durante le partite
  const withPlayers = process.env.SYNC_PLAYERS !== 'false';
  const liveDocs = await syncLive();
  const docs = [...(withPlayers ? await syncPlayers() : []), ...(withPlayers ? await syncLogs() : []), ...liveDocs];
  await commit(docs);
  const live = liveDocs[0].data;
  console.log(`Sync OK${withPlayers ? ' (giocatori + live)' : ' (solo live)'}: G${live.matchday.number} T${live.round?.number}/${live.matchday.numRounds} · ${live.status} · punti per ${Object.keys(live.points).length} giocatori · ${docs.length} documenti`);
}

main().catch((e) => { console.error(e); process.exit(1); });
