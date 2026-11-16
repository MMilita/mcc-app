// Motore tornei MCC (Regolamento art. 2.1 Play-In, 2.2 Playoff/Playout, 2.3 In-Season Tournament).
// Ogni partita di torneo confronta i punti Dunkest delle due franchigie nella giornata indicata.
import { normTeam } from './names.js';

export const HOME_BONUS = 15;

// punti di ogni squadra per giornata, dai dati H2H sincronizzati
export function pointsIndex(matchdays) {
  const idx = {};
  for (const md of matchdays || []) {
    const row = {};
    for (const m of md.matches || []) {
      for (const t of [m.home_team, m.away_team]) if (t?.name) row[normTeam(t.name)] = t.pts;
    }
    idx[md.number] = { pts: row, past: !!md.past };
  }
  return idx;
}

// classifica testa a testa fino alla giornata `upto` (inclusa): V, P, punti fatti
export function standingsAt(matchdays, upto) {
  const tab = {};
  for (const md of matchdays || []) {
    if (md.number > upto || !md.past) continue;
    for (const m of md.matches || []) {
      const H = m.home_team; const A = m.away_team;
      if (H?.pts == null || A?.pts == null || m.winner_id == null) continue;
      for (const t of [H, A]) tab[t.name] ||= { team: t.name, w: 0, l: 0, pf: 0 };
      tab[H.name].pf += H.pts; tab[A.name].pf += A.pts;
      if (m.winner_id === H.id) { tab[H.name].w += 1; tab[A.name].l += 1; } else { tab[A.name].w += 1; tab[H.name].l += 1; }
    }
  }
  return Object.values(tab).sort((a, b) => b.w - a.w || b.pf - a.pf).map((r, i) => ({ ...r, pos: i + 1 }));
}

// una partita: `home` riceve il bonus campo (null = campo neutro)
export function game(idx, current, a, b, md, home = null) {
  const d = idx[md];
  const raw = (t) => d?.pts?.[normTeam(t)];
  const pa = raw(a); const pb = raw(b);
  const status = !d || md > current ? 'scheduled' : md === current ? 'live' : (pa != null && pb != null ? 'played' : 'scheduled');
  const sa = pa == null ? null : pa + (home === a ? HOME_BONUS : 0);
  const sb = pb == null ? null : pb + (home === b ? HOME_BONUS : 0);
  const winner = status === 'played' && sa != null && sb != null ? (sa >= sb ? a : b) : null;
  return { a, b, md, home, pa: sa, pb: sb, rawA: pa, rawB: pb, status, winner };
}

// ---------------- In-Season Tournament ----------------
export function istPots(rows) {
  const t = rows.map((r) => r.team);
  return [t.slice(0, 4), t.slice(4, 8), t.slice(8, 12), t.slice(12, 16)];
}

// sorteggio: 4 gironi da 4 squadre, una per fascia
export function istDraw(pots) {
  const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const sh = pots.map(shuffle);
  return Object.fromEntries(['A', 'B', 'C', 'D'].map((g, i) => [g, sh.map((p) => p[i])]));
}

// 6 giornate: 3 contro il proprio girone, 3 contro la propria fascia (round robin a 4)
const RR4 = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
// mds: le 6 giornate dei gironi (es. 17, 18, 19, 21, 22, 23 con la 20 di riposo); numero = vecchio formato "prima giornata"
export const istGroupMds = (ist = {}) => {
  const list = parseMds(ist.groupMds);
  if (list.length >= 6) return list.slice(0, 6);
  const s = ist.startMd || 17;
  return [s, s + 1, s + 2, s + 4, s + 5, s + 6];
};
export function istSchedule(groups, pots, mdsOrStart) {
  const mds = Array.isArray(mdsOrStart) ? mdsOrStart : [0, 1, 2, 3, 4, 5].map((i) => mdsOrStart + i);
  const rounds = [];
  RR4.forEach((pairs, r) => rounds.push({ round: r + 1, md: mds[r], kind: 'girone', games: Object.entries(groups).flatMap(([g, ts]) => pairs.map(([i, j]) => ({ a: ts[i], b: ts[j], group: g }))) }));
  RR4.forEach((pairs, r) => rounds.push({ round: r + 4, md: mds[3 + r], kind: 'fascia', games: pots.flatMap((ts, p) => pairs.map(([i, j]) => ({ a: ts[i], b: ts[j], pot: p + 1 }))) }));
  return rounds;
}

// classifica di un girone (6 partite per squadra). Spareggi: scontri diretti, punti nel torneo, record RS, sorteggio
export function istGroupTable(teams, playedGames, rsRows) {
  const t = Object.fromEntries(teams.map((x) => [x, { team: x, w: 0, l: 0, pf: 0, g: 0 }]));
  for (const gm of playedGames) {
    for (const [me, op, p] of [[gm.a, gm.b, gm.pa], [gm.b, gm.a, gm.pb]]) {
      if (!t[me] || gm.status !== 'played') continue;
      t[me].g += 1; t[me].pf += p || 0;
      if (gm.winner === me) t[me].w += 1; else t[me].l += 1;
      void op;
    }
  }
  const rsPos = Object.fromEntries((rsRows || []).map((r) => [normTeam(r.team), r.pos]));
  const h2h = (x, y) => playedGames.filter((gm) => gm.status === 'played' && ((gm.a === x && gm.b === y) || (gm.a === y && gm.b === x))).reduce((s, gm) => s + (gm.winner === x ? 1 : -1), 0);
  return Object.values(t).sort((x, y) => y.w - x.w || h2h(y.team, x.team) || y.pf - x.pf || (rsPos[normTeam(x.team)] || 99) - (rsPos[normTeam(y.team)] || 99));
}

export function istKnockout(cfg, tables, idx, current) {
  const top = (g, n) => tables[g]?.[n - 1]?.team;
  const groupsDone = cfg.groupsDone;
  const qfPairs = [['A', 'B'], ['C', 'D'], ['B', 'A'], ['D', 'C']].map(([x, y]) => (groupsDone ? [top(x, 1), top(y, 2)] : [`1° ${x}`, `2° ${y}`]));
  const play = (pair, md) => (pair[0] && pair[1] && md && groupsDone ? game(idx, current, pair[0], pair[1], md) : { a: pair[0], b: pair[1], md, status: 'tbd' });
  const qf = qfPairs.map((p) => play(p, cfg.qfMd));
  const w = (g, label) => g.winner || label;
  const sf = [[w(qf[0], 'Vinc. QF1'), w(qf[1], 'Vinc. QF2')], [w(qf[2], 'Vinc. QF3'), w(qf[3], 'Vinc. QF4')]].map((p) => (qf.every((g) => g.winner) ? play(p, cfg.sfMd) : { a: p[0], b: p[1], md: cfg.sfMd, status: 'tbd' }));
  const fp = [w(sf[0], 'Vinc. SF1'), w(sf[1], 'Vinc. SF2')];
  const f = sf.every((g) => g.winner) ? play(fp, cfg.fMd) : { a: fp[0], b: fp[1], md: cfg.fMd, status: 'tbd' };
  return { qf, sf, f, champion: f.winner || null };
}

// ---------------- Serie al meglio di 3/5 (Playoff/Playout) ----------------
// gara 1, 3, 5 in casa della testa di serie migliore (`hi`), +15 punti al fattore campo
export function series(idx, current, hi, lo, mds, bestOf) {
  const need = Math.floor(bestOf / 2) + 1;
  const games = []; let wh = 0; let wl = 0;
  for (let i = 0; i < Math.min(bestOf, (mds || []).length); i++) {
    if (wh >= need || wl >= need) break;
    const home = i % 2 === 0 ? hi : lo;
    const g = game(idx, current, hi, lo, mds[i], home);
    games.push({ ...g, n: i + 1 });
    if (g.winner === hi) wh += 1; else if (g.winner === lo) wl += 1;
  }
  const winner = wh >= need ? hi : wl >= need ? lo : null;
  return { hi, lo, wh, wl, games, winner, loser: winner ? (winner === hi ? lo : hi) : null, bestOf };
}

// tabellone a 8: 1-8, 4-5, 3-6, 2-7 (vincenti 1/8 con 4/5, 2/7 con 3/6)
export function bracket8(idx, current, seeds, cfg) {
  const s = (n) => seeds[n - 1];
  const tbd = (label) => ({ placeholder: label });
  const mk = (a, b, mds) => (a && b && !a.placeholder && !b.placeholder ? series(idx, current, a, b, mds, cfg.bestOf || 3) : { hi: a?.placeholder || a, lo: b?.placeholder || b, games: [], winner: null, tbd: true });
  const qf = [[1, 8], [4, 5], [3, 6], [2, 7]].map(([x, y]) => mk(s(x) || tbd(`${x}ª`), s(y) || tbd(`${y}ª`), cfg.qfMds));
  const seedOf = (team) => seeds.indexOf(team) + 1;
  const order = (a, b) => (seedOf(a) <= seedOf(b) ? [a, b] : [b, a]);
  const win = (sr, label) => sr.winner || tbd(label);
  const sfPair = (x, y, lx, ly) => { const a = win(x, lx); const b = win(y, ly); return a.placeholder || b.placeholder ? [a, b] : order(a, b); };
  const sf = [sfPair(qf[0], qf[1], 'Vinc. 1-8', 'Vinc. 4-5'), sfPair(qf[2], qf[3], 'Vinc. 3-6', 'Vinc. 2-7')].map(([a, b]) => mk(a, b, cfg.sfMds));
  const fPair = sfPair(sf[0], sf[1], 'Vinc. SF1', 'Vinc. SF2');
  const f = mk(fPair[0], fPair[1], cfg.fMds);

  // tabellone parallelo: chi esce continua a giocare per i piazzamenti, accoppiato col record di Regular Season
  // (meglio classificata contro peggio classificata), non secondo il tabellone
  const rank = cfg.rank || seedOf;
  const byRank = (list) => list.slice().sort((a, b) => rank(a) - rank(b));
  const ready = (srs) => srs.every((x) => x.winner);
  const qfLosers = ready(qf) ? byRank(qf.map((x) => x.loser)) : null;
  const c58 = qfLosers
    ? [mk(qfLosers[0], qfLosers[3], cfg.sfMds), mk(qfLosers[1], qfLosers[2], cfg.sfMds)]
    : [mk(tbd('Perdente QF (miglior record)'), tbd('Perdente QF (peggior record)'), cfg.sfMds), mk(tbd('Perdente QF (2° record)'), tbd('Perdente QF (3° record)'), cfg.sfMds)];
  const pair = (a, b, la, lb) => (a && b ? byRank([a, b]) : [a || tbd(la), b || tbd(lb)]);
  const p5 = mk(...pair(c58[0].winner, c58[1].winner, 'Vinc. 5°-8° A', 'Vinc. 5°-8° B'), cfg.fMds);
  const p7 = mk(...pair(c58[0].loser, c58[1].loser, 'Perd. 5°-8° A', 'Perd. 5°-8° B'), cfg.fMds);
  const p3 = mk(...pair(sf[0].loser, sf[1].loser, 'Perdente SF1', 'Perdente SF2'), cfg.fMds);
  return { qf, sf, f, champion: f.winner || null, places: { c58, p3, p5, p7 } };
}

// ---------------- Play-In (7ª-10ª) ----------------
export function playIn(idx, current, rows, cfg) {
  const s = (n) => rows[n - 1]?.team;
  const g1 = game(idx, current, s(7), s(8), cfg.md1, s(7));
  const g2 = game(idx, current, s(9), s(10), cfg.md1, s(9));
  const l1 = g1.winner ? (g1.winner === g1.a ? g1.b : g1.a) : null;
  const w2 = g2.winner;
  const ordered = l1 && w2 ? ((rows.findIndex((r) => r.team === l1) <= rows.findIndex((r) => r.team === w2)) ? [l1, w2] : [w2, l1]) : null;
  const g3 = ordered ? game(idx, current, ordered[0], ordered[1], cfg.md2, ordered[0]) : { a: l1 || 'Perd. 7-8', b: w2 || 'Vinc. 9-10', md: cfg.md2, status: 'tbd' };
  const seed7 = g1.winner || null;
  const seed8 = g3.winner || null;
  const out = [g2.winner ? (g2.winner === g2.a ? g2.b : g2.a) : null, g3.winner ? (g3.winner === g3.a ? g3.b : g3.a) : null];
  return { g1, g2, g3, seed7, seed8, eliminated: out };
}

export const parseMds = (v) => String(v || '').split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0);
