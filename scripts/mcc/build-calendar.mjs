// Una tantum: costruisce scripts/mcc/calendar.json = giornate fantasy della stagione → partite NBA (gameId).
// Usa la suddivisione in giornate/turni di Dunkest (fantaking) solo per generare il file;
// dopo, il motore MCC lavora solo su calendario NBA + questo file.
import { writeFileSync } from 'node:fs';
import { nbaSchedule } from './sources.mjs';

const API = 'https://fantaking-api.dunkest.com/api/v1';
const j = (u) => fetch(u, { headers: { 'User-Agent': 'mcc-fantanba-sync/1.2', Accept: 'application/json' } }).then((r) => r.json());

const cfg = (await j(`${API}/leagues/1/config`)).data;
const nba = await nbaSchedule();
const games = nba.leagueSchedule.gameDates.flatMap((d) => d.games)
  .filter((g) => g.gameId.startsWith('002') || g.gameId.startsWith('006')) // regular season + NBA Cup
  .map((g) => ({ id: g.gameId, home: g.homeTeam.teamTricode, away: g.awayTeam.teamTricode, t: Date.parse(g.gameDateTimeUTC), dateET: g.gameDateEst?.slice(0, 10) }));

const out = { season: '2026-27', builtAt: new Date().toISOString(), scheduleId: cfg.current_schedule_id, matchdays: [] };
let missing = 0;
for (const md of cfg.matchdays) {
  const s = (await j(`${API}/schedules/${cfg.current_schedule_id}/matchdays/${md.id}`)).data;
  const list = [];
  for (const r of s.rounds || []) {
    for (const m of r.matches || []) {
      const t = Date.parse(m.started_at);
      const h = m.home_team.abbreviation, a = m.away_team.abbreviation;
      const g = games.filter((x) => x.home === h && x.away === a && Math.abs(x.t - t) < 36 * 3600e3).sort((x, y) => Math.abs(x.t - t) - Math.abs(y.t - t))[0]; // partite ripetute a giorni consecutivi: la più vicina
      if (!g) { missing++; console.warn(`G${md.number} T${r.number}: ${a}@${h} ${m.started_at} non trovata nel calendario NBA`); continue; }
      list.push({ gameId: g.id, round: r.number, dateET: g.dateET, t: g.t, home: h, away: a });
    }
  }
  list.sort((x, y) => x.t - y.t);
  out.matchdays.push({ number: md.number, dunkestId: md.id, games: list });
  process.stdout.write(`G${md.number}:${list.length} `);
}
writeFileSync(new URL('./calendar.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`\ncalendar.json: ${out.matchdays.length} giornate, ${out.matchdays.reduce((a, m) => a + m.games.length, 0)} partite, ${missing} non abbinate`);
