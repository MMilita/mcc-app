// Tempi di gioco come Dunkest: Giornata (G) divisa in Turni (T1, T2, …),
// un turno = blocco di partite dello stesso giorno. Un giocatore è "bloccato"
// appena inizia la partita della sua squadra; tra un turno e l'altro le sostituzioni sono aperte.
const GAME_LEN_MS = 2.75 * 3600 * 1000; // durata stimata di una partita NBA (per lo stato "in corso")

export function matchFor(team, schedule) {
  if (!team || !schedule) return null;
  for (const r of schedule.rounds || []) {
    for (const m of r.matches || []) {
      if (m.home === team || m.away === team) {
        const home = m.home === team;
        return { ...m, round: r.number, opp: home ? m.away : m.home, home };
      }
    }
  }
  return null; // squadra a riposo in questa giornata
}

export const hasStarted = (m, now = Date.now()) => !!m && new Date(m.startedAt).getTime() <= now;

export function roundWindows(schedule) {
  return (schedule?.rounds || []).map((r) => {
    const starts = r.matches.map((m) => new Date(m.startedAt).getTime());
    const first = Math.min(...starts);
    const last = Math.max(...starts);
    const ended = r.matches.every((m) => m.status === 'played');
    return { number: r.number, first, end: ended ? Math.min(Date.now(), last + GAME_LEN_MS) : last + GAME_LEN_MS, ended };
  });
}

// Stato della giornata per l'header della formazione
export function matchdayState(schedule, now = Date.now()) {
  const wins = roundWindows(schedule);
  if (!wins.length) return { label: 'Nessuna partita', open: true, round: '–', total: 0 };
  const live = wins.find((w) => now >= w.first && now < w.end);
  const next = wins.find((w) => now < w.first);
  const startedCount = wins.filter((w) => now >= w.first).length;
  if (live) return { open: false, live: true, label: 'Partite in corso', round: live.number, total: wins.length };
  if (next) return { open: true, label: 'Sost. Aperte', countdownTo: next.first, round: next.number, total: wins.length, startedCount };
  return { open: false, ended: true, label: 'Giornata conclusa', round: wins.length, total: wins.length };
}

export function countdown(to, now = Date.now()) {
  const ms = Math.max(0, to - now);
  const h = Math.floor(ms / 3.6e6); const m = Math.floor((ms % 3.6e6) / 6e4); const s = Math.floor((ms % 6e4) / 1000);
  const d = Math.floor(h / 24);
  return d >= 1 ? `${d}g ${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const TZ = 'Europe/Rome';
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ });

// peso del punteggio per posizione (Regolamento Dunkest Draft)
export const SLOT_WEIGHT = { S: 1, X: 1, B: 0.5, T: 0 };
export const CAPTAIN_MULT = 1.5;
