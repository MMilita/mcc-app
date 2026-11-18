// Motore "MCC stats": ricostruisce TUTTE le statistiche Dunkest da fonti gratuite
// (box score ufficiali NBA + injury report CBS Sports) e, nella fase in parallelo,
// le confronta campo per campo con Dunkest. Risultati in Firestore, collezione mccstats/*:
//   state            giocatori (ID NBA ↔ ID Dunkest, squadra, ruolo, crediti MCC), giorni e giornate già elaborati
//   logs_c0..c15     partita per partita di ogni giocatore (tutte le voci del box score + PDK)
//   day_YYYY-MM-DD   confronto del giorno: ogni giocatore, ogni statistica, MCC vs Dunkest
//   md_N             giornata fantasy: PDK della prima partita, variazione crediti, confronto con Dunkest
//   season           medie stagionali MCC vs Dunkest, tutte le voci
//   dkcr_N           crediti Dunkest all'inizio della giornata N (per misurare lo scarto dei crediti MCC)
//   inj_YYYY-MM-DD   giocatori fuori secondo CBS quel giorno · injuries = elenco CBS più recente
//   meta             riepilogo per la dashboard del Commissioner
// Gira ogni giorno da GitHub Actions (.github/workflows/mcc-stats.yml).
import { readFileSync } from 'node:fs';
import { commit, getDocData } from './firestore.mjs';
import { pdk, deltaCredits, MIN_CREDITS } from './mcc/formula.mjs';
import { nbaBoxscore, nbaSchedule, cbsInjuries, dunkestPlayers, dunkestMatchday, fantakingProfiles, fantakingMatchLogs, normName, matchByName } from './mcc/sources.mjs';

const SEASON_START = '2026-10-20';
const LAG_DAYS = Number(process.env.MCC_LAG_DAYS ?? 2); // si consolida un giorno solo dopo 2 giorni (correzioni NBA/Dunkest)
const REPROCESS_FROM = process.env.MCC_REPROCESS_FROM || null; // es. 2026-11-10: rielabora da quella data
const DRY = process.env.MCC_DRY_RUN === 'true';
const CHUNKS = 16;
const C = 'mccstats';
const API = 'https://fantaking-api.dunkest.com/api/v1';

const calendar = JSON.parse(readFileSync(new URL('./mcc/calendar.json', import.meta.url), 'utf8'));
const aliases = JSON.parse(readFileSync(new URL('./mcc/aliases.json', import.meta.url), 'utf8')); // { "nome dunkest normalizzato": nbaId }

// ---------- utilità ----------
const r1 = (x) => Math.round((x + Math.sign(x) * 1e-9) * 10) / 10;
const r2 = (x) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;
const pct = (m, a) => (a ? r1((m / a) * 100) : 0);
const secsOf = (iso = '') => { const m = /PT(\d+)M([\d.]+)S/.exec(iso); return m ? Number(m[1]) * 60 + Math.round(Number(m[2])) : 0; };
const etDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const todayET = etDate(Date.now());
const lastDate = addDays(todayET, -LAG_DAYS);
const docs = [];
const put = (path, data) => docs.push({ path: `${C}/${path}`, data });
const warnings = [];

// Voci del log partita (ordine fisso, salvate come stringa "a|b|c")
const LOG_FIELDS = ['date', 'gameId', 'team', 'opp', 'home', 'win', 'starter', 'secs', 'pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'blka', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'tov', 'pf', 'fd', 'pm', 'pdk'];
const packLog = (g) => LOG_FIELDS.map((k) => (typeof g[k] === 'boolean' ? (g[k] ? 1 : 0) : g[k])).join('|');
const unpackLog = (s) => { const v = s.split('|'); const o = {}; LOG_FIELDS.forEach((k, i) => { o[k] = ['date', 'gameId', 'team', 'opp'].includes(k) ? v[i] : Number(v[i]); }); return o; };

// Statistiche aggregate esattamente come le calcola Dunkest (tabella stats, modalità tot/avg)
export function aggregate(games, mode) {
  const gp = games.length;
  const sum = (k) => games.reduce((a, g) => a + g[k], 0);
  const t = {
    gp, starter: sum('starter'),
    min: mode === 'avg' ? r1(sum('secs') / 60 / gp) : games.reduce((a, g) => a + Math.round(g.secs / 60), 0),
    pdk: mode === 'avg' ? r1(sum('pdk') / gp) : r2(sum('pdk')),
  };
  const base = { pts: 'pts', oreb: 'oreb', dreb: 'dreb', ast: 'ast', stl: 'stl', blk: 'blk', blka: 'blka', fgm: 'fgm', fga: 'fga', tpm: 'tpm', tpa: 'tpa', ftm: 'ftm', fta: 'fta', tov: 'tov', pf: 'pf', fouls_received: 'fd', plus_minus: 'pm' };
  for (const [out, k] of Object.entries(base)) t[out] = mode === 'avg' ? r1(sum(k) / gp) : sum(k);
  t.reb = mode === 'avg' ? r1((sum('oreb') + sum('dreb')) / gp) : sum('oreb') + sum('dreb');
  t.fgp = pct(sum('fgm'), sum('fga')); t.tpp = pct(sum('tpm'), sum('tpa')); t.ftp = pct(sum('ftm'), sum('fta'));
  return t;
}
export const COMPARE_FIELDS = ['gp', 'min', 'starter', 'pdk', 'pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'blka', 'fgm', 'fga', 'fgp', 'tpm', 'tpa', 'tpp', 'ftm', 'fta', 'ftp', 'tov', 'pf', 'fouls_received', 'plus_minus'];
const same = (a, b, f) => Math.abs(Number(a) - Number(b)) < (f === 'pdk' ? 0.006 : 0.051) * (f === 'pdk' ? 1 : 0.2); // pdk 2 decimali, altri esatti a 0.01

// Confronta righe MCC e Dunkest giocatore per giocatore, voce per voce
function compareTables(ours, dk, state, label) {
  const fields = Object.fromEntries(COMPARE_FIELDS.map((f) => [f, { ok: 0, n: 0 }]));
  const mism = []; const onlyDk = []; const onlyOurs = new Set(Object.keys(ours));
  let playersAllOk = 0;
  for (const row of dk) {
    const nba = state.map[row.id];
    const o = nba && ours[nba];
    const nm = `${row.first_name} ${row.last_name}`.trim();
    if (!o) { onlyDk.push(`${nm} (${row.team_code})`); continue; }
    onlyOurs.delete(String(nba));
    let allOk = true;
    for (const f of COMPARE_FIELDS) {
      fields[f].n++;
      if (same(o[f], row[f], f)) fields[f].ok++;
      else { allOk = false; mism.push([nm, row.team_code, f, o[f], Number(row[f])].join('|')); }
    }
    if (allOk) playersAllOk++;
  }
  const tot = Object.values(fields).reduce((a, x) => ({ ok: a.ok + x.ok, n: a.n + x.n }), { ok: 0, n: 0 });
  return {
    label, fields, values: tot, players: { compared: dk.length - onlyDk.length, allOk: playersAllOk },
    onlyDk, onlyOurs: [...onlyOurs].map((id) => `${state.players[id]?.n || id} (${state.players[id]?.t || ''})`),
    mismatches: mism.slice(0, 400), mismatchCount: mism.length,
  };
}

// ---------- stato ----------
async function load(path) { return DRY ? null : getDocData(`${C}/${path}`).catch(() => null); }
const state = (await load('state')) || { players: {}, map: {}, pending: {}, doneDates: [], doneMds: [], startMd: null, seededAt: null };
state.players ||= {}; state.map ||= {}; state.pending ||= {}; state.doneDates ||= []; state.doneMds ||= [];
if (REPROCESS_FROM) {
  state.doneDates = state.doneDates.filter((d) => d < REPROCESS_FROM);
  const firstMd = calendar.matchdays.find((m) => m.games.some((g) => g.dateET >= REPROCESS_FROM))?.number ?? 999;
  // crediti MCC: torno ai valori di inizio della prima giornata da rifare (salvati nel suo documento)
  const redo = state.doneMds.filter((n) => n >= firstMd).sort((a, b) => a - b)[0];
  if (redo != null) {
    const prev = await getDocData(`${C}/md_${redo}`).catch(() => null);
    if (!prev) throw new Error(`Rielaborazione: manca mccstats/md_${redo}, impossibile ripristinare i crediti`);
    for (const r of prev.rows) { const v = r.split('|'); if (state.players[v[0]]) state.players[v[0]].cr = Number(v[5]); }
  }
  state.doneMds = state.doneMds.filter((n) => n < firstMd);
  state.backtestMds = (state.backtestMds || []).filter((n) => n < firstMd);
}
const meta = (await load('meta')) || { days: {}, mds: {} };
meta.days ||= {}; meta.mds ||= {};

const logs = {}; // nbaId → [log]
for (let i = 0; i < CHUNKS; i++) {
  const d = await load(`logs_c${i}`);
  for (const [id, rows] of Object.entries(d?.logs || {})) logs[id] = rows.map(unpackLog).filter((g) => !REPROCESS_FROM || g.date < REPROCESS_FROM);
}

// ---------- Dunkest: seed crediti iniziali + istantanea crediti a inizio giornata ----------
const dkNow = await dunkestPlayers();
const dkById = Object.fromEntries(dkNow.map((p) => [p.id, p]));
const fk = await fetch(`${API}/leagues/1/config`, { headers: { Accept: 'application/json' } }).then((r) => r.json()).then((j) => j.data).catch(() => null);
const posMap = { G: 'G', F: 'A', C: 'C' };
if (!state.seededAt) {
  state.startMd = fk?.current_matchday?.number;
  state.seededAt = new Date().toISOString();
  state.seedStatus = fk?.status_id ?? null;
  for (const p of dkNow) state.pending[p.id] = { n: `${p.first_name} ${p.last_name}`.trim(), t: p.team_code, p: posMap[p.position] || p.position, cr: Number(p.cr) };
  console.log(`Seed: ${dkNow.length} giocatori con i crediti Dunkest attuali, crediti MCC calcolati da G${state.startMd}`);
}
// prima volta che vediamo la giornata N in corso → fotografiamo i crediti Dunkest (= dopo la giornata N-1)
if (fk?.current_matchday?.number && ![4, 5].includes(fk.status_id)) {
  const n = fk.current_matchday.number;
  if (!(await load(`dkcr_${n}`))) put(`dkcr_${n}`, { matchday: n, takenAt: new Date(), cr: Object.fromEntries(dkNow.map((p) => [p.id, Number(p.cr)])) });
}

// ---------- abbinamento giocatori NBA ↔ Dunkest ----------
const dkCands = dkNow.map((p) => ({ name: `${p.first_name} ${p.last_name}`.trim(), team: p.team_code, p }));
const aliasByNba = Object.fromEntries(Object.entries(aliases).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [String(v), k]));
function findDunkest(id, name, team) {
  const free = dkCands.filter((c) => !state.map[c.p.id]); // un ID Dunkest si abbina a un solo ID NBA
  if (aliasByNba[id]) return free.find((c) => normName(c.name) === aliasByNba[id])?.p || null;
  return matchByName(name, team, free)?.p || null;
}
// Profili fantaking: una scansione completa al primo avvio e poi ogni 7 giorni (nuovi tesserati);
// negli altri giorni si rileggono solo i profili già abbinati (crediti + flag infortunato Dunkest).
const fkPos = { Guard: 'G', Forward: 'A', Center: 'C' };
state.fk ||= {};
const fullScan = !state.fkScannedAt || Date.now() - Date.parse(state.fkScannedAt) > 7 * 864e5;
const profiles = await fantakingProfiles(fullScan ? {} : { ids: Object.keys(state.fk).map(Number) }).catch((e) => { warnings.push(`Profili fantaking: ${e.message}`); return []; });
for (const p of profiles) state.fk[p.id] = { n: `${p.first_name} ${p.last_name}`.trim(), t: p.team.abbreviation, p: fkPos[p.position?.name] || null, cr: p.quotation, inj: !!p.is_injured };
if (fullScan && profiles.length > 200) state.fkScannedAt = new Date().toISOString();
const fkCands = () => Object.entries(state.fk).filter(([fid]) => !Object.values(state.players).some((s) => s.fk === Number(fid))).map(([fid, f]) => ({ fid: Number(fid), name: f.n, team: f.t }));

function seePlayer(pl, team) {
  const id = String(pl.id);
  let s = state.players[id];
  if (!s) s = state.players[id] = { n: pl.name, t: team, p: null, cr: MIN_CREDITS, dk: null, new: true };
  if (s.dk == null) {
    // ID NBA non ancora abbinato: cerco il giocatore Dunkest (nome, nome invertito, squadra+cognome+iniziale, alias)
    const dk = findDunkest(id, pl.name, team);
    if (dk) {
      const pend = state.pending[dk.id];
      Object.assign(s, { p: pend?.p || posMap[dk.position] || dk.position, cr: pend?.cr ?? Number(dk.cr), dk: Number(dk.id), new: false });
      state.map[dk.id] = id; delete state.pending[dk.id];
    }
  }
  s.t = team; s.n = pl.name;
  return s;
}
// collega ogni giocatore al suo profilo fantaking; chi non è nella tabella stats Dunkest (mai sceso in campo)
// prende da lì crediti e ruolo
function linkProfiles() {
  const cands = fkCands();
  for (const s of Object.values(state.players)) {
    if (s.fk != null) continue;
    const m = matchByName(s.n, s.t, cands);
    if (!m) continue;
    s.fk = m.fid; cands.splice(cands.indexOf(m), 1);
    const f = state.fk[m.fid];
    if (s.dk == null && s.new && !state.doneMds.length) { s.cr = f.cr; s.p = f.p; s.new = false; s.fromProfile = true; }
    if (!s.p) s.p = f.p;
  }
}

// ---------- 1) giorni: box score NBA → log partite + confronto con Dunkest ----------
const sched = await nbaSchedule();
const nbaGames = sched.leagueSchedule.gameDates.flatMap((d) => d.games).filter((g) => /^00(2|6)/.test(g.gameId));
const byDate = {};
for (const g of nbaGames) (byDate[g.gameDateEst.slice(0, 10)] ||= []).push(g);
const boxCache = {};
const box = async (id) => (boxCache[id] ||= await nbaBoxscore(id));

function dunkestDay(date) {
  const p = new URLSearchParams({ season_id: '29', mode: 'nba', stats_type: 'tot', date_from: date, date_to: date, player_search: '', min_cr: '0', max_cr: '100', sort_by: 'pdk', sort_order: 'desc' });
  for (let t = 1; t <= 30; t++) p.append('teams[]', String(t));
  for (const x of [1, 2, 3]) p.append('positions[]', x);
  return fetch(`https://www.dunkest.com/api/stats/table?${p}`, { headers: { 'User-Agent': 'mcc-fantanba-sync/1.2' } }).then((r) => r.json());
}

const newDates = [];
for (let d = SEASON_START; d <= lastDate; d = addDays(d, 1)) if (byDate[d] && !state.doneDates.includes(d)) newDates.push(d);
for (const date of newDates) {
  const games = byDate[date].filter((g) => g.gameStatus === 3 || true);
  const dayRows = {}; let finals = 0;
  for (const g of games) {
    const b = await box(g.gameId).catch((e) => { warnings.push(`${date} ${g.gameId}: ${e.message}`); return null; });
    if (!b) continue;
    if (!b.final) { warnings.push(`${date} ${g.gameId} non finale (${b.status}): rinviata?`); continue; }
    finals++;
    for (const [team, t] of Object.entries(b.teams)) {
      for (const pl of t.players) {
        const s = seePlayer(pl, team);
        if (!pl.played) { ((state.absent ||= {})[g.gameId] ||= {})[pl.id] = pl.notPlayingReason || pl.status || 'DNP'; continue; }
        const stats = { ...pl, starter: pl.starter };
        const log = { date, gameId: g.gameId, team, opp: t.opp, home: t.home, win: t.win, starter: pl.starter, secs: secsOf(pl.min), ...Object.fromEntries(['pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'blka', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'tov', 'pf', 'fd', 'pm'].map((k) => [k, pl[k]])), pdk: pdk(stats, t.win) };
        const id = String(pl.id);
        logs[id] = (logs[id] || []).filter((x) => x.gameId !== g.gameId).concat(log).sort((a, b2) => a.date.localeCompare(b2.date));
        (dayRows[id] ||= []).push(log);
        void s;
      }
    }
  }
  const ours = Object.fromEntries(Object.entries(dayRows).map(([id, gs]) => [id, aggregate(gs, 'tot')]));
  const dk = await dunkestDay(date).catch(() => []);
  const cmp = compareTables(ours, dk, state, date);
  put(`day_${date}`, { date, games: games.length, finals, ourPlayers: Object.keys(ours).length, dkPlayers: dk.length, ...cmp, updatedAt: new Date() });
  meta.days[date] = { values: cmp.values, players: cmp.players, pdk: cmp.fields.pdk, onlyDk: cmp.onlyDk.length, onlyOurs: cmp.onlyOurs.length, games: games.length };
  if (finals === games.length) state.doneDates.push(date);
  console.log(`${date}: ${finals}/${games.length} partite, ${Object.keys(ours).length} giocatori · valori uguali ${cmp.values.ok}/${cmp.values.n} · PDK ${cmp.fields.pdk.ok}/${cmp.fields.pdk.n}`);
}

linkProfiles();

// ---------- 2) injury report CBS (fotografia del giorno) ----------
let injNow = null;
try {
  const cbs = await cbsInjuries();
  const cands = Object.entries(state.players).map(([id, s]) => ({ id, name: s.n, team: s.t }));
  const out = []; const gtd = []; const unmatched = [];
  const rows = cbs.map((r) => {
    const id = matchByName(r.name, r.team, cands)?.id;
    if (!id) unmatched.push(`${r.name} (${r.team})`);
    else (r.out ? out : gtd).push(id);
    return [id || '', r.name, r.team, r.injury, r.status, r.updated].join('|');
  });
  injNow = { out, gtd };
  // CBS (fuori) vs Dunkest (is_injured dal profilo fantaking), oggi
  const dkInj = new Set(Object.entries(state.players).filter(([, s]) => s.fk != null && state.fk[s.fk]?.inj).map(([id]) => id));
  const cbsOut = new Set(out);
  const nm = (id) => `${state.players[id]?.n} (${state.players[id]?.t})`;
  const injCmp = { both: [...cbsOut].filter((x) => dkInj.has(x)).map(nm), cbsOnly: [...cbsOut].filter((x) => !dkInj.has(x)).map(nm), dkOnly: [...dkInj].filter((x) => !cbsOut.has(x)).map(nm), gtdDkInjured: gtd.filter((x) => dkInj.has(x)).map(nm) };
  meta.injCompare = { date: todayET, both: injCmp.both.length, cbsOnly: injCmp.cbsOnly.length, dkOnly: injCmp.dkOnly.length, gtdDkInjured: injCmp.gtdDkInjured.length };
  put(`inj_${todayET}`, { date: todayET, out, gtd, unmatched, takenAt: new Date() });
  put('injuries', { date: todayET, rows, unmatched, compare: injCmp, takenAt: new Date() });
  console.log(`CBS: ${cbs.length} infortunati (${out.length} fuori, ${gtd.length} in dubbio, ${unmatched.length} non abbinati)`);
} catch (e) { warnings.push(`CBS injury report non disponibile: ${e.message}`); }

async function injOn(date) {
  // fotografia CBS di quel giorno, oppure la più vicina precedente (fino a 7 giorni), altrimenti quella di oggi
  for (let i = 0; i <= 7; i++) { const d = addDays(date, -i); if (d === todayET && injNow) return injNow; const x = await load(`inj_${d}`); if (x) return x; }
  return null;
}

// ---------- 3) giornate fantasy: PDK della prima partita + variazione crediti ----------
// live     (giornate da startMd in poi): i crediti MCC evolvono con la nostra formula e si confrontano con Dunkest
// backtest (giornate prima di startMd): crediti di partenza = quelli Dunkest di quella giornata (match log fantaking),
//          variazione calcolata con le statistiche NBA → misura la formula giornata per giornata
const MD_FIELDS = ['nbaId', 'nome', 'squadra', 'giocato', 'fpt', 'crPrima', 'delta', 'crDopo', 'fuoriCBS', 'dkFpt', 'dkDelta', 'dkCrPrima', 'motivoNBA', 'dkGiocato'];
const isDone = (md) => md.games.length && [...new Set(md.games.map((g) => g.dateET))].every((d) => state.doneDates.includes(d));
const todoLive = calendar.matchdays.filter((m) => state.startMd != null && m.number >= state.startMd && !state.doneMds.includes(m.number) && isDone(m));
state.backtestMds ||= [];
const todoBack = calendar.matchdays.filter((m) => state.startMd != null && m.number < state.startMd && !state.backtestMds.includes(m.number) && isDone(m));
const fkIds = Object.values(state.players).map((s) => s.fk).filter((x) => x != null);
const mlogs = todoLive.length || todoBack.length ? await fantakingMatchLogs(fkIds).catch((e) => { warnings.push(`Match log fantaking: ${e.message}`); return {}; }) : {};

async function processMatchday(md, mode) {
  const dates = [...new Set(md.games.map((g) => g.dateET))];
  const gameIds = new Set(md.games.map((g) => g.gameId));
  const first = {}; // prima partita di ogni squadra nella giornata
  for (const g of md.games) for (const t of [g.home, g.away]) first[t] ||= g;
  const inj = mode === 'live' ? await injOn(md.games[0].dateET) : null;
  const injOut = new Set(inj?.out || []);
  const dkMd = await dunkestMatchday(md.number).catch(() => []);
  const dkMdById = Object.fromEntries(dkMd.map((r) => [state.map[r.id], r]));
  const dkCr0 = mode === 'live' ? (await load(`dkcr_${md.number}`))?.cr || null : null;
  const rows = []; const sum = { mode, n: 0, fptOk: 0, fptN: 0, plusOk: 0, plusN: 0, crOk: 0, crN: 0, cr01: 0, crMax: 0, dnp: 0, dkFrozen: 0, cbsRuleOk: 0, nbaRuleOk: 0, cbsAvailable: !!inj };
  for (const [id, s] of Object.entries(state.players)) {
    const mine = (logs[id] || []).filter((x) => gameIds.has(x.gameId));
    const team = mine[0]?.team || s.t; // per i giocatori scambiati vale la squadra di quella giornata
    const g = first[team];
    if (!g) continue;
    const log = mine.find((x) => x.gameId === g.gameId);
    const played = !!log; const fpt = log ? log.pdk : 0;
    // Dunkest NON congela gli infortunati: chi non gioca prende -0.1 (verificato G1-G9: 99.6%).
    // CBS resta solo come informazione (cbsOut) e per mostrare quanto sbaglierebbe una regola "congela se CBS fuori".
    const cbsOut = !played && injOut.has(id);
    const frozen = false;
    const nbaReason = played ? '' : (state.absent?.[g.gameId]?.[id] || 'NON_A_REFERTO');
    const ml = s.fk != null ? mlogs[s.fk]?.[md.number] : null; // verità Dunkest della giornata
    const dk = dkMdById[id];
    const dkFpt = ml ? ml.fpt : dk ? Number(dk.pdk) : null;
    const dkPlus = ml ? ml.plus : dk ? Number(dk.plus) : null;
    const dkPlayed = ml ? ml.played : dk ? Number(dk.gp) > 0 : null;
    const dkBefore = ml ? ml.cr : (dkCr0 && s.dk != null ? dkCr0[s.dk] ?? null : null);
    if (mode === 'backtest' && dkBefore == null) continue;
    const crBefore = mode === 'live' ? s.cr : dkBefore;
    const d = deltaCredits(crBefore, fpt, played, frozen);
    if (mode === 'live') s.cr = r1(crBefore + d);
    sum.n++;
    if (dkFpt != null && (played || dkPlayed)) { sum.fptN++; if (Math.abs(dkFpt - fpt) < 0.006) sum.fptOk++; }
    if (dkPlus != null) { sum.plusN++; if (Math.abs(dkPlus - d) < 0.051) sum.plusOk++; }
    if (mode === 'live' && dkBefore != null) {
      sum.crN++; const diff = Math.abs(dkBefore - crBefore);
      if (diff < 0.051) sum.crOk++; if (diff < 0.151) sum.cr01++; sum.crMax = Math.max(sum.crMax, r1(diff));
    }
    // congelamento: Dunkest non ha toccato i crediti pur non giocando (e sopra il minimo) vs regola CBS vs motivo NBA
    if (!played && dkPlus != null && crBefore > MIN_CREDITS + 0.05) {
      const dkFrozen = Math.abs(dkPlus) < 0.05;
      const nbaInj = /INJURY|NOT_WITH_TEAM|PERSONAL/.test(nbaReason);
      sum.dnp++; if (dkFrozen) sum.dkFrozen++;
      if (inj && dkFrozen === cbsOut) sum.cbsRuleOk++;
      if (!dkFrozen) sum.noFreezeOk = (sum.noFreezeOk || 0) + 1;
      if (dkFrozen === nbaInj) sum.nbaRuleOk++;
    }
    rows.push([id, s.n, team, played ? 1 : 0, fpt, crBefore, d, r1(crBefore + d), cbsOut ? 1 : 0, dkFpt ?? '', dkPlus ?? '', dkBefore ?? '', nbaReason, dkPlayed == null ? '' : dkPlayed ? 1 : 0].join('|'));
  }
  put(`md_${md.number}`, { number: md.number, mode, dates, games: md.games.length, fields: MD_FIELDS, rows, summary: sum, injSnapshot: inj?.date || null, updatedAt: new Date() });
  meta.mds[md.number] = sum;
  console.log(`G${md.number} [${mode}]: ${sum.n} giocatori · PDK prima partita ${sum.fptOk}/${sum.fptN} · variazione crediti ${sum.plusOk}/${sum.plusN}${mode === 'live' ? ` · crediti uguali a Dunkest ${sum.crOk}/${sum.crN}` : ''} · congelati Dunkest ${sum.dkFrozen}/${sum.dnp} (regola NBA ok ${sum.nbaRuleOk})`);
}
for (const md of todoBack) { await processMatchday(md, 'backtest'); state.backtestMds.push(md.number); }
for (const md of todoLive) { await processMatchday(md, 'live'); state.doneMds.push(md.number); }

// ---------- 4) medie stagionali MCC vs Dunkest (fino all'ultimo giorno consolidato) ----------
const lastDone = [...state.doneDates].sort().pop();
if (lastDone) {
  const ours = {};
  for (const [id, gs] of Object.entries(logs)) { const x = gs.filter((g) => g.date <= lastDone); if (x.length) ours[id] = aggregate(x, 'avg'); }
  const p = new URLSearchParams({ season_id: '29', mode: 'nba', stats_type: 'avg', date_from: SEASON_START, date_to: lastDone, player_search: '', min_cr: '0', max_cr: '100', sort_by: 'pdk', sort_order: 'desc' });
  for (let t = 1; t <= 30; t++) p.append('teams[]', String(t));
  for (const x of [1, 2, 3]) p.append('positions[]', x);
  const dk = await fetch(`https://www.dunkest.com/api/stats/table?${p}`, { headers: { 'User-Agent': 'mcc-fantanba-sync/1.2' } }).then((r) => r.json()).catch(() => []);
  const cmp = compareTables(ours, dk, state, `stagione fino al ${lastDone}`);
  put('season', { ...cmp, until: lastDone, updatedAt: new Date() });
  meta.season = { until: lastDone, values: cmp.values, players: cmp.players, fields: cmp.fields, onlyDk: cmp.onlyDk.length, onlyOurs: cmp.onlyOurs.length };
  console.log(`Stagione al ${lastDone}: valori uguali ${cmp.values.ok}/${cmp.values.n}, giocatori identici in tutto ${cmp.players.allOk}/${cmp.players.compared}`);
}

// crediti MCC attuali vs Dunkest attuali (indicativo: Dunkest può aver già chiuso una giornata in più)
const crCmp = { n: 0, same: 0, within02: 0, maxDiff: 0 };
for (const s of Object.values(state.players)) {
  if (s.dk == null || !dkById[s.dk]) continue;
  const diff = Math.abs(Number(dkById[s.dk].cr) - s.cr); crCmp.n++;
  if (diff < 0.051) crCmp.same++; if (diff < 0.251) crCmp.within02++; crCmp.maxDiff = Math.max(crCmp.maxDiff, r1(diff));
}

// ---------- salvataggio ----------
const chunks = Array.from({ length: CHUNKS }, () => ({}));
for (const [id, gs] of Object.entries(logs)) chunks[Number(id) % CHUNKS][id] = gs.map(packLog);
chunks.forEach((c, i) => put(`logs_c${i}`, { logs: c, fields: LOG_FIELDS, updatedAt: new Date() }));
state.doneDates.sort(); state.doneMds.sort((a, b) => a - b);
{ const keep = new Set(nbaGames.filter((g) => g.gameDateEst.slice(0, 10) >= addDays(todayET, -30)).map((g) => g.gameId)); for (const k of Object.keys(state.absent || {})) if (!keep.has(k)) delete state.absent[k]; }
put('state', state);
put('meta', {
  ...meta, updatedAt: new Date(), lastDate: lastDone || null, lastMd: state.doneMds.at(-1) ?? null, startMd: state.startMd, seededAt: state.seededAt,
  players: Object.keys(state.players).length, pending: Object.keys(state.pending).length, newPlayers: Object.values(state.players).filter((s) => s.new).length,
  crNow: crCmp, dunkestMatchday: fk ? { number: fk.current_matchday?.number, status: fk.status_id } : null, warnings: warnings.slice(0, 50),
});
if (DRY) { console.log(`DRY RUN: ${docs.length} documenti NON scritti`); if (process.env.MCC_DUMP) (await import('node:fs')).writeFileSync(process.env.MCC_DUMP, JSON.stringify(docs)); }
else await commit(docs);
console.log(`MCC stats OK: ${newDates.length} giorni elaborati, ${Object.keys(state.players).length} giocatori, ${docs.length} documenti${warnings.length ? ` · ${warnings.length} avvisi` : ''}`);
warnings.forEach((w) => console.log('::warning::' + w));
