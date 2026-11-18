// Fonti gratuite per "MCC stats": box score ufficiali NBA (cdn.nba.com) e injury report CBS Sports.
// Dunkest serve solo per il confronto nella fase in parallelo (e per i crediti iniziali).

// Il CDN NBA risponde 403 senza intestazioni da browser con Origin/Referer nba.com
const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nba.com',
  Referer: 'https://www.nba.com/',
};
const BROWSER = { 'User-Agent': NBA_HEADERS['User-Agent'], 'Accept-Language': 'en-US,en;q=0.9' };

async function get(url, headers, type = 'json', tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return type === 'json' ? await res.json() : await res.text();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

// nomi confrontabili tra NBA, CBS e Dunkest: niente accenti, suffissi, punteggiatura
export const normName = (s = '') => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, ' ')
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
// stessa persona anche con nome/cognome invertiti (Yang Hansen / Hansen Yang)
export const nameKey = (s) => normName(s).split(' ').sort().join(' ');

// Trova il giocatore giusto tra i candidati {name, team}: nome identico (in qualunque ordine);
// altrimenti stessa squadra + stesso cognome + stessa iniziale (EJ/Elijah Harkless, Alex/Alexandre Sarr, GG/Gregory Jackson)
export function matchByName(name, team, candidates) {
  const k = nameKey(name);
  const exact = candidates.filter((c) => nameKey(c.name) === k);
  if (exact.length) return exact.length > 1 ? exact.find((c) => c.team === team) || exact[0] : exact[0];
  const n = normName(name).split(' ');
  const last = n.at(-1), ini = n[0]?.[0];
  const loose = candidates.filter((c) => { const m = normName(c.name).split(' '); return c.team === team && m.at(-1) === last && m[0]?.[0] === ini; });
  if (loose.length === 1) return loose[0];
  // refusi nelle fonti (es. "Evan Mobely" nei box score NBA): stessa squadra e al massimo 2 lettere di differenza
  const nn = normName(name);
  const typo = candidates.filter((c) => c.team === team && lev(normName(c.name), nn) <= 2);
  return typo.length === 1 ? typo[0] : null;
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

// ---- NBA ----
export const nbaSchedule = () => get('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', NBA_HEADERS);

const toNum = (v) => Number(v) || 0;
// box score di una partita → { gameId, status, final, teams: { TRI: { win, score, players: [...] } } }
export async function nbaBoxscore(gameId) {
  const g = (await get(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`, NBA_HEADERS)).game;
  const out = { gameId, status: g.gameStatusText, final: g.gameStatus === 3, start: g.gameTimeUTC, teams: {} };
  const sides = [g.homeTeam, g.awayTeam];
  for (const [i, t] of sides.entries()) {
    const opp = sides[1 - i];
    out.teams[t.teamTricode] = {
      score: t.score, win: t.score > opp.score, opp: opp.teamTricode, home: i === 0,
      players: (t.players || []).map((p) => {
        const s = p.statistics || {};
        return {
          id: p.personId, name: `${p.firstName} ${p.familyName}`.trim(), played: p.played === '1', starter: p.starter === '1',
          status: p.status, notPlayingReason: p.notPlayingReason || null,
          min: s.minutes || '', pts: toNum(s.points), oreb: toNum(s.reboundsOffensive), dreb: toNum(s.reboundsDefensive),
          ast: toNum(s.assists), stl: toNum(s.steals), blk: toNum(s.blocks), blka: toNum(s.blocksReceived),
          fgm: toNum(s.fieldGoalsMade), fga: toNum(s.fieldGoalsAttempted), tpm: toNum(s.threePointersMade),
          tpa: toNum(s.threePointersAttempted), ftm: toNum(s.freeThrowsMade), fta: toNum(s.freeThrowsAttempted),
          tov: toNum(s.turnovers), pf: toNum(s.foulsPersonal), fd: toNum(s.foulsDrawn), pm: toNum(s.plusMinusPoints),
        };
      }),
    };
  }
  return out;
}

// ---- CBS Sports injury report ----
// Città/nome squadra CBS → sigla NBA
const CBS_TEAMS = {
  atlanta: 'ATL', boston: 'BOS', brooklyn: 'BKN', charlotte: 'CHA', chicago: 'CHI', cleveland: 'CLE', dallas: 'DAL',
  denver: 'DEN', detroit: 'DET', 'golden state': 'GSW', 'golden st.': 'GSW', houston: 'HOU', indiana: 'IND', 'la clippers': 'LAC',
  'l.a. clippers': 'LAC', 'la lakers': 'LAL', 'l.a. lakers': 'LAL', 'los angeles clippers': 'LAC', 'los angeles lakers': 'LAL',
  memphis: 'MEM', miami: 'MIA', milwaukee: 'MIL', minnesota: 'MIN', 'new orleans': 'NOP', 'new york': 'NYK',
  'oklahoma city': 'OKC', orlando: 'ORL', philadelphia: 'PHI', phoenix: 'PHX', portland: 'POR', sacramento: 'SAC',
  'san antonio': 'SAS', toronto: 'TOR', utah: 'UTA', washington: 'WAS',
};
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// → [{ team, name, pos, updated, injury, status, out }]
export async function cbsInjuries() {
  const html = await get('https://www.cbssports.com/nba/injuries/', { ...BROWSER, Accept: 'text/html' }, 'text');
  const out = [];
  // una sezione per squadra: nome squadra seguito dalla sua tabella
  const blocks = html.split(/TeamLogoNameLockup-name/).slice(1);
  for (const b of blocks) {
    const teamName = strip((b.match(/<a[^>]*>([^<]+)<\/a>/) || [])[1] || '').toLowerCase();
    const team = CBS_TEAMS[teamName];
    const table = b.split('</table>')[0];
    for (const row of table.match(/<tr class="TableBase-bodyTr[^"]*">[\s\S]*?<\/tr>/g) || []) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      if (cells.length < 5) continue;
      const long = cells[0].match(/CellPlayerName--long[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
      const name = strip(long ? long[1] : cells[0]);
      const status = strip(cells[4]);
      out.push({ team: team || teamName, name, pos: strip(cells[1]), updated: strip(cells[2]), injury: strip(cells[3]), status,
        // "Expected to be out until at least …" / "Out" → fuori; "Game Time Decision" → in dubbio, non fuori
        out: /^(out|expected to be out)/i.test(status) });
    }
  }
  if (out.length < 20) throw new Error(`CBS injuries: solo ${out.length} righe, struttura pagina cambiata?`);
  return out;
}

// ---- Dunkest (solo confronto / seed) ----
// Profili pubblici fantaking: crediti (quotation), ruolo e flag infortunato (is_injured) di ogni giocatore,
// anche di chi non è mai sceso in campo. Gli ID sono condivisi con altri campionati: un giocatore NBA attuale
// ha una squadra NBA e quotation > 0.
const NBA_TRI = new Set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '));
async function fkProfile(i) {
  const r = await fetch(`https://fantaking-api.dunkest.com/api/v1/players/${i}/profile?league=1&lang=it`, { headers: { Accept: 'application/json', ...DK_UA }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r || !r.ok) return null;
  return (await r.json().catch(() => null))?.data || null;
}
const isNbaPlayer = (p) => p && NBA_TRI.has(p.team?.abbreviation) && p.quotation > 0 && !/coach/i.test(p.position?.name || '');
// ids: elenco di ID da rileggere; senza ids scansiona 1..maxId (una tantum, ~1-2 minuti)
export async function fantakingProfiles({ ids = null, maxId = 6000 } = {}) {
  const list = ids || Array.from({ length: maxId }, (_, i) => i + 1);
  const out = [];
  for (let i = 0; i < list.length; i += 12) {
    const batch = await Promise.all(list.slice(i, i + 12).map(fkProfile));
    for (const p of batch) if (isNbaPlayer(p)) out.push(p);
  }
  return out;
}
function dunkestParams(extra) {
  const p = new URLSearchParams({ season_id: '29', player_search: '', min_cr: '0', max_cr: '100', sort_by: 'pdk', sort_order: 'desc', ...extra });
  for (let t = 1; t <= 30; t++) p.append('teams[]', String(t));
  for (const pos of ['1', '2', '3']) p.append('positions[]', pos);
  return p;
}
const DK_UA = { 'User-Agent': 'mcc-fantanba-sync/1.2' };
// crediti attuali di tutti i giocatori Dunkest
export const dunkestPlayers = () => get(`https://www.dunkest.com/api/stats/table?${dunkestParams({ mode: 'nba', stats_type: 'avg', date_from: '2026-10-01', date_to: '2027-06-30' })}`, DK_UA);
// PDK (prima partita) e variazione crediti di una giornata fantasy
export function dunkestMatchday(number, rounds = 4) {
  const p = dunkestParams({ mode: 'dunkest', stats_type: 'tot' });
  p.append('weeks[]', String(number));
  for (let r = 1; r <= rounds; r++) p.append('rounds[]', String(r));
  return get(`https://www.dunkest.com/api/stats/table?${p}`, DK_UA);
}

// Match log pubblico di un giocatore fantaking: per ogni giornata crediti (CR), variazione (PLUS), punteggio (FPT), minuti
export async function fantakingMatchLog(fkId) {
  const r = await fetch(`https://fantaking-api.dunkest.com/api/v1/basketball/leagues/1/players/${fkId}/match-log/rendered`, { headers: { Accept: 'application/json', ...DK_UA }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  const d = r?.ok ? (await r.json().catch(() => null))?.data : null;
  if (!d?.rows?.length || !d.columns.includes('MIN')) return null;
  const out = {};
  for (const row of d.rows) {
    const x = Object.fromEntries(d.columns.map((c, i) => [c, row[i]]));
    out[Number(x.MD)] = { cr: Number(x.CR), plus: Number(String(x.PLUS).replace('+', '')) || 0, fpt: Number(x.FPT), played: x.MIN !== '00:00', vs: x.VS };
  }
  return out;
}
export async function fantakingMatchLogs(fkIds) {
  const out = {};
  for (let i = 0; i < fkIds.length; i += 12) {
    const part = fkIds.slice(i, i + 12);
    const res = await Promise.all(part.map(fantakingMatchLog));
    part.forEach((id, k) => { if (res[k]) out[id] = res[k]; });
  }
  return out;
}
