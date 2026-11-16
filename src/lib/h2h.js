// Dati del torneo testa a testa (lega Draft Dunkest), sincronizzati in Firestore nella collezione h2h.
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export { normTeam } from './names';
import { normTeam } from './names';

let cache = null; // una sola lettura per sessione (65 documenti)
export function useH2H() {
  const [state, setState] = useState(cache || { loading: true, matchdays: [], meta: null });
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    // modalità test E2E (solo `vite dev`): dati da e2e/h2h.json, esclusi dalla build
    if (import.meta.env.DEV && (() => { try { return localStorage.getItem('mcc-e2e') === '1'; } catch { return false; } })()) {
      import('../../e2e/h2h.json').then((m) => {
        const d = m.default; cache = { loading: false, matchdays: d.matchdays, meta: d.meta, standings: d.standings };
        if (alive) setState(cache);
      }).catch((error) => alive && setState({ loading: false, matchdays: [], meta: null, error }));
      return () => { alive = false; };
    }
    getDocs(collection(db, 'h2h')).then((snap) => {
      const matchdays = []; let meta = null; let standings = null;
      snap.forEach((d) => {
        if (d.id.startsWith('md_')) matchdays.push(d.data());
        else if (d.id === 'meta') meta = d.data();
        else if (d.id === 'standings') standings = d.data();
      });
      matchdays.sort((a, b) => a.number - b.number);
      cache = { loading: false, matchdays, meta, standings };
      if (alive) setState(cache);
    }).catch((error) => alive && setState({ loading: false, matchdays: [], meta: null, error }));
    return () => { alive = false; };
  }, []);
  return state;
}

// Partite di una franchigia (per nome), dal suo punto di vista
export function teamSchedule(matchdays, teamName) {
  const key = normTeam(teamName);
  const out = [];
  for (const md of matchdays) {
    for (const m of md.matches || []) {
      const home = normTeam(m.home_team?.name) === key;
      const away = normTeam(m.away_team?.name) === key;
      if (!home && !away) continue;
      const me = home ? m.home_team : m.away_team;
      const opp = home ? m.away_team : m.home_team;
      const played = md.past && me?.pts != null;
      out.push({
        md: md.number, matchId: m.id, home, played,
        me: me?.pts ?? null, opp: opp?.name, oppPts: opp?.pts ?? null,
        result: !played ? null : m.winner_id == null ? 'live' : m.winner_id === me?.id ? 'W' : 'L',
        detail: md.details?.[String(m.id)] || null,
      });
    }
  }
  return out;
}

export const ROLE = { Guard: 'G', Forward: 'A', Center: 'C', 'Head Coach': 'HC' };
