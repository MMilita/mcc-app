// Calendario della lega per giornata (come la scheda "Partite" del torneo Dunkest)
import { useEffect, useState } from 'react';
import { useData, fmt } from '../lib/data';
import { normTeam, useH2H } from '../lib/h2h';
import { FranchiseLogo, Spinner } from './ui';
import MatchDetail from './MatchDetail';

export default function LeagueCalendar() {
  const { franchises, live } = useData();
  const { loading, matchdays, meta } = useH2H();
  const current = meta?.currentMatchday || live?.matchday?.number || 1;
  const [md, setMd] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { if (md == null && current) setMd(current); }, [current, md]);
  if (loading) return <Spinner />;
  const list = matchdays.filter((m) => (m.matches || []).length);
  const cur = list.find((m) => m.number === md) || list[0];
  if (!cur) return <p className="muted">Calendario non ancora disponibile.</p>;
  const f = (n) => franchises.find((x) => normTeam(x.name) === normTeam(n));
  const idx = list.indexOf(cur);
  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="md-picker">
        <button className="btn sm ghost" disabled={idx <= 0} onClick={() => setMd(list[idx - 1].number)} aria-label="Giornata precedente">‹</button>
        <div className="md-chips">
          {list.slice(Math.max(0, idx - 3), idx + 4).map((m) => (
            <button key={m.number} className={`fbtn ${m.number === cur.number ? 'on' : ''} ${m.number === current ? 'cur' : ''}`} onClick={() => setMd(m.number)}>{m.number}</button>
          ))}
        </div>
        <button className="btn sm ghost" disabled={idx >= list.length - 1} onClick={() => setMd(list[idx + 1].number)} aria-label="Giornata successiva">›</button>
      </div>
      <div className="small muted">Giornata {cur.number}{cur.number === current ? ' · in corso' : cur.past ? ' · giocata' : ' · da giocare'}</div>
      <div className="grid" style={{ gap: 8 }}>
        {cur.matches.map((m) => {
          const H = m.home_team; const A = m.away_team;
          const detail = cur.details?.[String(m.id)];
          const hw = m.winner_id === H.id; const aw = m.winner_id === A.id;
          const app = cur.app?.matches?.[String(m.id)];
          const hasApp = app && (app.home != null || app.away != null);
          return (
            <div key={m.id} className="cal-item">
            <button className="cal-row" disabled={!detail} onClick={() => detail && setOpen({ detail, md: cur.number })}>
              <span className={`cal-t ${hw ? 'win' : ''}`}><FranchiseLogo f={f(H.name)} size={28} /><span>{H.name}</span></span>
              <span className="cal-s num"><b className={hw ? 'win' : ''}>{H.pts != null ? fmt(H.pts, 2) : '–'}</b><b className={aw ? 'win' : ''}>{A.pts != null ? fmt(A.pts, 2) : '–'}</b></span>
              <span className={`cal-t r ${aw ? 'win' : ''}`}><span>{A.name}</span><FranchiseLogo f={f(A.name)} size={28} /></span>
            </button>
            {hasApp && (
              <div className="cal-app" title="Punteggio calcolato dall'app MCC con le formazioni salvate sull'app (prova in parallelo)">
                <span>Formazioni app MCC</span>
                <b className="num">{app.home != null ? fmt(app.home, 2) : '–'}</b>
                <b className="num">{app.away != null ? fmt(app.away, 2) : '–'}</b>
                <span className="small muted">{app.home != null && app.away != null ? (((app.home > app.away) === hw) ? 'stesso esito' : 'esito diverso') : 'una sola squadra sull\'app'}</span>
              </div>
            )}
            </div>
          );
        })}
      </div>
      {cur.app && Object.keys(cur.app.teams || {}).length > 0 && <p className="small muted">Prova in parallelo: sotto le partite, il punteggio che le squadre avrebbero fatto con la formazione salvata sull'app MCC (punti esatti Dunkest, stesse regole). Il risultato ufficiale resta quello Dunkest.</p>}
      {open && <MatchDetail detail={open.detail} matchday={open.md} onClose={() => setOpen(null)} />}
    </div>
  );
}
