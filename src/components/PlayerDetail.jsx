// Scheda giocatore (come Dunkest): prossime partite, forma (grafico punti per partita), statistiche partita per partita
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData, fmt } from '../lib/data';
import { fmtDay, fmtTime } from '../lib/timing';

const cache = {};
export function usePlayerLog(id) {
  const [games, setGames] = useState(null);
  useEffect(() => {
    if (id == null) return undefined;
    const c = Number(id) % 8;
    let alive = true;
    const load = cache[c] || (cache[c] = getDoc(doc(db, 'playerlog', `c${c}`)).then((s) => s.data()?.logs || {}).catch(() => ({})));
    load.then((logs) => {
      if (!alive) return;
      const rows = (logs[String(id)] || []).map((r) => {
        const [md, rd, pdk, min, pts, reb, ast, stl, blk, tov, opp, home, t] = r.split('|');
        return { md: +md, rd: +rd, pdk: +pdk, min: +min, pts: +pts, reb: +reb, ast: +ast, stl: +stl, blk: +blk, tov: +tov, opp, home: home === '1', t: +t };
      }).sort((a, b) => a.t - b.t || a.md - b.md);
      setGames(rows);
    });
    return () => { alive = false; };
  }, [id]);
  return games;
}

// prossime partite della squadra NBA: giornata corrente (turni non iniziati) + prossima giornata
function upcoming(live, team) {
  const out = [];
  const now = Date.now();
  for (const sch of [live?.schedule, live?.next]) {
    for (const r of sch?.rounds || []) {
      for (const m of r.matches || []) {
        if (m.home !== team && m.away !== team) continue;
        if (new Date(m.startedAt).getTime() < now) continue;
        out.push({ md: sch.number, rd: r.number, t: m.startedAt, opp: m.home === team ? m.away : m.home, home: m.home === team });
      }
    }
  }
  return out.slice(0, 5);
}

// Grafico a barre dei punti Dunkest per partita (una serie): media come linea di riferimento,
// etichette solo su massimo e ultima partita, dettaglio al passaggio/tocco
function FormChart({ games }) {
  const [hover, setHover] = useState(null);
  const last = games.slice(-10);
  if (!last.length) return <p className="muted small">Nessuna partita giocata.</p>;
  const W = 320; const H = 150; const padB = 22; const padT = 18; const gap = 2;
  const max = Math.max(10, ...last.map((g) => g.pdk));
  const avg = last.reduce((s, g) => s + g.pdk, 0) / last.length;
  const bw = (W - gap * 9) / 10; // sempre 10 posti: barre di larghezza costante
  const y = (v) => H - padB - (Math.max(0, v) / max) * (H - padB - padT);
  const iMax = last.reduce((b, g, i) => (g.pdk > last[b].pdk ? i : b), 0);
  return (
    <div className="pd-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Punti Dunkest nelle ultime ${last.length} partite, media ${fmt(avg, 1)}`}>
        <line x1="0" x2={W} y1={H - padB} y2={H - padB} className="pd-axis" />
        <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} className="pd-avg" />
        {last.map((g, i) => {
          const x = i * (bw + gap); const top = y(g.pdk);
          const showLabel = i === iMax || i === last.length - 1;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
              <rect x={x} y={padT - 6} width={bw} height={H - padT} fill="transparent" />
              <path className={`pd-bar ${hover === i ? 'on' : ''}`} d={`M${x},${H - padB} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + bw - 4} Q${x + bw},${top} ${x + bw},${top + 4} V${H - padB} Z`} />
              {showLabel && <text x={x + bw / 2} y={top - 4} textAnchor="middle" className="pd-lbl">{fmt(g.pdk, 1)}</text>}
              <text x={x + bw / 2} y={H - 7} textAnchor="middle" className="pd-tick">G{g.md}</text>
            </g>
          );
        })}
      </svg>
      <div className="pd-tip" aria-live="polite">
        {hover != null ? (() => { const g = last[hover]; return <span>G{g.md} T{g.rd} · {g.home ? 'vs' : '@'} {g.opp}: <b>{fmt(g.pdk, 1)}</b> punti · {fmt(g.min, 0)}' · {g.pts} pt {g.reb} rb {g.ast} as</span>; })()
          : <span>Linea tratteggiata = media {fmt(avg, 1)} · tocca una barra per il dettaglio</span>}
      </div>
    </div>
  );
}

export default function PlayerDetail({ player }) {
  const { live } = useData();
  const games = usePlayerLog(player?.id);
  const [tab, setTab] = useState('info');
  if (!player) return null;
  const next = upcoming(live, player.team);
  const avgN = (n) => { const g = (games || []).slice(-n); return g.length ? g.reduce((s, x) => s + x.pdk, 0) / g.length : null; };
  return (
    <div className="pd">
      <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={tab === 'info'} className={`tab ${tab === 'info' ? 'on' : ''}`} onClick={() => setTab('info')}>Info</button>
        <button role="tab" aria-selected={tab === 'games'} className={`tab ${tab === 'games' ? 'on' : ''}`} onClick={() => setTab('games')}>Partite</button>
      </div>
      {tab === 'info' ? (
        <div className="grid" style={{ gap: 14 }}>
          <section>
            <h3 className="pd-h">Prossime partite</h3>
            {next.length ? (
              <div className="pd-next">{next.map((g, i) => (
                <div key={i}><b>{fmtDay(g.t)}</b><span>{fmtTime(g.t)}</span><small>G{g.md} · T{g.rd}</small><strong>{g.home ? 'vs' : '@'} {g.opp}</strong></div>
              ))}</div>
            ) : <p className="muted small">Calendario non ancora disponibile.</p>}
          </section>
          <section>
            <h3 className="pd-h">Forma</h3>
            <div className="pd-avgs">
              <div><small>MEDIA ULTIME 5</small><b className="num">{avgN(5) != null ? fmt(avgN(5), 2) : '–'}</b></div>
              <div><small>MEDIA ULTIME 10</small><b className="num">{avgN(10) != null ? fmt(avgN(10), 2) : '–'}</b></div>
            </div>
            {games ? <FormChart games={games} /> : <p className="muted small">Caricamento…</p>}
          </section>
          <section>
            <h3 className="pd-h">Medie stagione</h3>
            <table className="pd-season"><tbody>
              {[['Minuti', player.min], ['Punti', player.pts], ['Rimbalzi (off.)', `${fmt(player.reb)} (${fmt(player.oreb)})`], ['Assist', player.ast], ['Recuperi', player.stl], ['Stoppate', player.blk], ['Palle perse', player.tov], ['Titolare', `${player.gs} su ${player.gp}`], ['FG% / 3P% / TL%', `${fmt(player.fgp)} / ${fmt(player.tpp)} / ${fmt(player.ftp)}`]].map(([k, v]) => (
                <tr key={k}><td className="muted">{k}</td><td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{typeof v === 'number' ? fmt(v) : v}</td></tr>
              ))}
            </tbody></table>
          </section>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="pd-games">
            <thead><tr><th>G</th><th>Avv.</th><th>Min</th><th>Pt</th><th>Rb</th><th>As</th><th>Rc</th><th>St</th><th>Pp</th><th>FPT</th></tr></thead>
            <tbody>{(games || []).slice().reverse().map((g, i) => (
              <tr key={i}><td className="num">{g.md}<small className="muted">·T{g.rd}</small></td><td>{g.home ? 'vs' : '@'} {g.opp}</td><td className="num">{fmt(g.min, 0)}</td><td className="num">{g.pts}</td><td className="num">{g.reb}</td><td className="num">{g.ast}</td><td className="num">{g.stl}</td><td className="num">{g.blk}</td><td className="num">{g.tov}</td><td className="num" style={{ fontWeight: 800 }}>{fmt(g.pdk, 1)}</td></tr>
            ))}</tbody>
          </table>
          {games && !games.length && <p className="muted small pad">Nessuna partita giocata in stagione.</p>}
        </div>
      )}
    </div>
  );
}
