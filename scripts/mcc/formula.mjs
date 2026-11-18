// Formule "MCC stats": replica dei calcoli Dunkest NBA, verificate sui dati 2026/27.
// Dettagli e verifica: ~/Desktop/dunkest/analisi-dunkest/ANALISI.md

export const MIN_CREDITS = 4.0;

const r2 = (x) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;
const r1 = (x) => Math.round((x + Math.sign(x) * 1e-9) * 10) / 10;

// PDK di una partita. s: { pts, oreb, dreb, ast, stl, blk, blka, fgm, fga, tpm, ftm, fta, tov, starter }
export function pdk(s, win) {
  const reb = s.oreb + s.dreb;
  let x = s.pts + s.dreb + 1.25 * s.oreb + 1.5 * s.ast + 1.5 * s.stl - 1.5 * s.tov
        + 1.5 * s.blk - 0.5 * s.blka
        - (s.fga - s.fgm) - (s.fta - s.ftm)
        + (s.starter ? 1 : 0);
  if (s.tpm >= 5) x += 5; else if (s.tpm >= 3) x += s.tpm;
  const dd = [s.pts, reb, s.ast, s.stl, s.blk].filter((v) => v >= 10).length;
  x += dd >= 4 ? 50 : dd === 3 ? 10 : dd === 2 ? 5 : 0;
  if (win) x += 0.05 * Math.abs(x);
  return r2(x);
}

// Variazione crediti a fine giornata (conta solo la prima partita della squadra nella giornata).
// played=false: -0.1 anche se infortunato (Dunkest non congela: verificato su G1-G9, 99.6%). Minimo 4.0 crediti.
// frozen resta disponibile ma il motore lo passa sempre false.
export function deltaCredits(cr, fpt, played, frozen = false) {
  let d;
  if (played) d = r1((fpt - 1.95 * cr) / 80); // 98.3% su 2697 variazioni G1-G9 (1.96: 98.26%)
  else d = frozen ? 0 : -0.1;
  return r1(Math.max(MIN_CREDITS, r1(cr + d)) - cr);
}
