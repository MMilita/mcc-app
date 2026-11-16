// Dettaglio partita testa a testa (come "Dettaglio Partita" di Dunkest): formazioni affiancate con i punti.
import { useData, fmt } from '../lib/data';
import { keyOf } from '../lib/cap';
import { ROLE, normTeam } from '../lib/h2h';
import { FranchiseLogo, Icon, Sheet } from './ui';

function Row({ l, r, byKey, weight }) {
  const cell = (p, side) => {
    if (!p) return <span className={`md-p ${side}`} />;
    const dk = byKey[keyOf(`${p.first_name} ${p.last_name}`)];
    return (
      <span className={`md-p ${side}`}>
        <i className={`tag-role ${ROLE[p.position?.name] || ''}`}>{ROLE[p.position?.name] || '?'}</i>
        <span className="md-name">{p.last_name}{p.is_captain && <b className="md-c" title="Capitano">C</b>}{p.is_sixth_man && <b className="md-6" title="6° uomo">6°</b>}</span>
        <small className="md-team">{dk?.team || ''}{p.round?.number ? ` · T${p.round.number}` : ''}</small>
      </span>
    );
  };
  // punti come li conta Dunkest: capitano ×1,5, panchina 50% (6° uomo 100%), tribuna 0
  const pts = (p) => {
    if (!p) return <b className="md-pts" />;
    if (p.pts == null) return <b className="md-pts muted">T{p.round?.number || ''}</b>;
    const w = weight === 'bench' ? (p.is_sixth_man ? 1 : 0.5) : weight === 'reserve' ? 0 : 1;
    const v = p.pts * w * (p.is_captain ? p.captain_multiplier || 1.5 : 1);
    return <b className={`md-pts num ${w === 0 ? 'zero' : ''}`} title={w !== 1 ? `${fmt(p.pts, 2)} × ${w * 100}%` : undefined}>{fmt(v, 2)}</b>;
  };
  return (
    <div className="md-row">
      {cell(l, 'l')}{pts(l)}{pts(r)}{cell(r, 'r')}
    </div>
  );
}

function Group({ title, home = [], away = [], byKey, weight }) {
  const n = Math.max(home.length, away.length);
  if (!n) return null;
  const sort = (a) => a.slice().sort((x, y) => (x.court_position ?? 99) - (y.court_position ?? 99));
  const h = sort(home); const a = sort(away);
  return (
    <section className="md-group">
      <h3>{title}</h3>
      <div className="md-box">{Array.from({ length: n }, (_, i) => <Row key={i} l={h[i]} r={a[i]} byKey={byKey} weight={weight} />)}</div>
    </section>
  );
}

export default function MatchDetail({ detail, matchday, onClose }) {
  const { franchises, playerByKey } = useData();
  if (!detail) return null;
  const f = (name) => franchises.find((x) => normTeam(x.name) === normTeam(name));
  const H = detail.home_team; const A = detail.away_team;
  const win = detail.winner_id === H?.id ? 'h' : detail.winner_id === A?.id ? 'a' : null;
  return (
    <Sheet onClose={onClose}>
      <div className="row between"><h3>Giornata {matchday}</h3><button className="btn sm ghost" onClick={onClose} aria-label="Chiudi"><Icon.x /></button></div>
      <div className="md-head">
        <div className={win === 'h' ? 'win' : ''}><FranchiseLogo f={f(H?.name)} size={40} /><span>{H?.name}</span><b className="num">{fmt(H?.pts, 2)}</b></div>
        <span className="md-vs">vs</span>
        <div className={`r ${win === 'a' ? 'win' : ''}`}><b className="num">{fmt(A?.pts, 2)}</b><span>{A?.name}</span><FranchiseLogo f={f(A?.name)} size={40} /></div>
      </div>
      <Group title="Titolari" weight="starter" home={H?.players?.starters} away={A?.players?.starters} byKey={playerByKey} />
      <Group title="Panchina (50%)" weight="bench" home={H?.players?.bench} away={A?.players?.bench} byKey={playerByKey} />
      <Group title="Tribuna (0%)" weight="reserve" home={H?.players?.reserve} away={A?.players?.reserve} byKey={playerByKey} />
      <p className="small muted">Punti come li conta Dunkest: capitano ×1,5, panchina al 50% (6° uomo al 100%), tribuna 0. Tieni premuto un punteggio per il valore pieno.</p>
    </Sheet>
  );
}
