// Partite testa a testa di una franchigia: passate (risultato, apribili) e future (avversario).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, fmt } from '../lib/data';
import { normTeam, teamSchedule, useH2H } from '../lib/h2h';
import { FranchiseLogo, Spinner } from './ui';
import MatchDetail from './MatchDetail';

export function useTeamSchedule(teamName) {
  const h2h = useH2H();
  return { ...h2h, games: teamName ? teamSchedule(h2h.matchdays, teamName) : [] };
}

export default function TeamMatches({ franchise, compact = false }) {
  const { franchises } = useData();
  const { loading, games, error } = useTeamSchedule(franchise?.name);
  const [tab, setTab] = useState('past');
  const [open, setOpen] = useState(null);
  if (loading) return <div className="card pad"><Spinner /></div>;
  if (error || !games.length) return <div className="card pad muted small">Calendario testa a testa non ancora disponibile.</div>;
  const past = games.filter((g) => g.played).reverse();
  const future = games.filter((g) => !g.played);
  const w = past.filter((g) => g.result === 'W').length; const l = past.filter((g) => g.result === 'L').length;
  const avg = past.length ? past.reduce((s, g) => s + (g.me || 0), 0) / past.length : 0;
  const avgOpp = past.length ? past.reduce((s, g) => s + (g.oppPts || 0), 0) / past.length : 0;
  const byName = (n) => franchises.find((x) => normTeam(x.name) === normTeam(n));
  const list = (tab === 'past' ? past : future).slice(0, compact ? 4 : undefined);

  return (
    <div className="card">
      <div className="pad row between" style={{ paddingBottom: 8, flexWrap: 'wrap' }}>
        <h3>Partite</h3>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'past'} className={`tab ${tab === 'past' ? 'on' : ''}`} onClick={() => setTab('past')}>Giocate ({past.length})</button>
          <button role="tab" aria-selected={tab === 'future'} className={`tab ${tab === 'future' ? 'on' : ''}`} onClick={() => setTab('future')}>Prossime</button>
        </div>
      </div>
      {tab === 'past' && past.length > 0 && (
        <div className="tm-summary">
          <div><b className="num">{w}-{l}</b><small>BILANCIO</small></div>
          <div><b className="num">{fmt(avg, 1)}</b><small>MEDIA FATTI</small></div>
          <div><b className="num">{fmt(avgOpp, 1)}</b><small>MEDIA SUBITI</small></div>
          <div className="streak">{past.slice(0, 5).map((g) => <i key={g.md} className={g.result}>{g.result === 'W' ? 'V' : g.result === 'L' ? 'P' : '·'}</i>)}<small>ULTIME 5</small></div>
        </div>
      )}
      <div className="tm-list">
        {list.map((g) => {
          const o = byName(g.opp);
          const Row = g.detail ? 'button' : 'div';
          return (
            <Row key={g.md} className={`tm-row ${g.result || ''}`} onClick={g.detail ? () => setOpen(g) : undefined}>
              <span className="tm-md">G{g.md}</span>
              <span className={`tm-res ${g.result || 'next'}`}>{g.result === 'W' ? 'V' : g.result === 'L' ? 'P' : g.result === 'live' ? 'LIVE' : g.home ? 'CASA' : 'FUORI'}</span>
              <span className="tm-opp"><FranchiseLogo f={o} size={26} /><span>{g.home ? 'vs' : '@'} {g.opp}</span></span>
              {g.played ? <span className="tm-score num"><b>{fmt(g.me, 2)}</b> – {fmt(g.oppPts, 2)}</span> : <span className="tm-score muted small">{o?.gm || ''}</span>}
              {g.detail && <span className="tm-go" aria-hidden="true">›</span>}
            </Row>
          );
        })}
      </div>
      {compact && <div className="pad" style={{ paddingTop: 8 }}><Link className="small" to={`/app/franchigia/${franchise.id}`}>Tutte le partite →</Link></div>}
      {open && <MatchDetail detail={open.detail} matchday={open.md} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Ultima formazione schierata su Dunkest (dall'ultima partita giocata)
export function LastLineupButton({ franchise }) {
  const { games } = useTeamSchedule(franchise?.name);
  const [open, setOpen] = useState(false);
  const last = games.filter((g) => g.played && g.detail).pop();
  if (!last) return null;
  return (
    <>
      <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={() => setOpen(true)}>Ultima formazione (G{last.md})</button>
      {open && <MatchDetail detail={last.detail} matchday={last.md} onClose={() => setOpen(false)} />}
    </>
  );
}
