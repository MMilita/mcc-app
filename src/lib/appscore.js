// Punteggio di giornata calcolato dall'app MCC a partire dalle formazioni salvate sull'app
// e dai punti esatti dei singoli giocatori (Dunkest). Modulo puro: usato dal sync e dall'app.
//
// Regole (come Dunkest Draft):
//  - quintetto e 6° uomo 100%, panchina 50%, tribuna 0%, capitano ×1,5 (deve essere in quintetto)
//  - vale lo storico dei salvataggi con orario del server: per ogni giocatore conta la posizione
//    che aveva nell'ultimo salvataggio PRIMA dell'inizio della sua partita; dopo può solo scendere
//    (es. titolare che ha giocato male spostato in panchina al 50%), mai salire.
//  - il capitano si può cambiare solo se né il nuovo né il vecchio hanno ancora giocato.

export const CAPTAIN = 1.5;

export function slotWeight(lineup, name) {
  if (!lineup || !name) return 0;
  if ((lineup.starters || []).includes(name)) return 1;
  if (lineup.sixth === name) return 1;
  if ((lineup.bench || []).includes(name)) return 0.5;
  return 0;
}

const playersOf = (v) => [...(v.starters || []), v.sixth, ...(v.bench || []), ...(v.tribuna || [])].filter(Boolean);

/**
 * @param versions  salvataggi [{ savedAt: ms, starters, sixth, bench, tribuna, captain }]
 * @param startOf   (name) => ms di inizio della partita del giocatore in questa giornata (null = non gioca)
 * @param ptsOf     (name) => punti Dunkest del giocatore nella giornata (null se non disponibili)
 * @param window    { start: ms primo inizio giornata, end: ms fine giornata }
 */
export function scoreTeam({ versions, startOf, ptsOf, window }) {
  const sorted = (versions || []).filter((v) => v.savedAt != null).sort((a, b) => a.savedAt - b.savedAt);
  const inPlay = sorted.filter((v) => v.savedAt < window.end);
  if (!inPlay.length) return null;
  const before = (t) => { let last = null; for (const v of inPlay) { if (v.savedAt < t) last = v; else break; } return last; };
  const final = inPlay[inPlay.length - 1];

  // capitano: si segue lo storico applicando la regola del cambio
  let cap = (before(window.start) || inPlay[0]).captain || null;
  for (const v of inPlay) {
    if (!v.captain || v.captain === cap) continue;
    const t = v.savedAt;
    const newOk = (startOf(v.captain) ?? Infinity) > t;
    const oldOk = !cap || (startOf(cap) ?? Infinity) > t;
    if (newOk && oldOk) cap = v.captain;
  }

  const names = new Set(inPlay.flatMap(playersOf));
  const rows = [];
  let score = 0;
  for (const name of names) {
    const start = startOf(name);
    const wFinal = slotWeight(final, name);
    const lockVersion = start != null && start < window.end ? before(start) : null;
    const wLock = start != null && start < window.end ? slotWeight(lockVersion, name) : wFinal;
    const w = Math.min(wLock, wFinal);
    const isCap = name === cap && (final.starters || []).includes(name) && w === 1;
    const pts = ptsOf(name);
    const val = pts == null ? 0 : pts * w * (isCap ? CAPTAIN : 1);
    score += val; // come Dunkest: somma dei valori pieni, arrotondamento solo sul totale
    rows.push({ name, w, pts, captain: isCap, value: Math.round(val * 100) / 100 });
  }
  rows.sort((a, b) => b.w - a.w || b.value - a.value);
  return { score: Math.round(score * 100) / 100, captain: cap, savedAt: final.savedAt, versions: inPlay.length, players: rows };
}
