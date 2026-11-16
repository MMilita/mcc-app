import { useMemo, useState } from 'react';
import { useData, fmt } from '../lib/data';
import { keyOf } from '../lib/cap';
import { FranchiseLogo, Icon, Jersey, RoleTag, Sheet, Spinner } from '../components/ui';
import PlayerDetail from '../components/PlayerDetail';

const SORTS = { pdk: 'PDK', cr: 'Crediti', value: 'PDK/CR', min: 'Minuti' };

export default function Players() {
  const { players, owners, franchiseById, myFranchiseId, playersMeta } = useData();
  const [q, setQ] = useState('');
  const [roles, setRoles] = useState([]);
  const [own, setOwn] = useState('free');
  const [sort, setSort] = useState('pdk');
  const [maxCr, setMaxCr] = useState(40);
  const [sel, setSel] = useState(null);
  const [copied, setCopied] = useState(false);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return players
      .map((p) => ({ ...p, owner: owners[keyOf(p.name)] || null, value: p.cr ? p.pdk / p.cr : 0 }))
      .filter((p) => (!roles.length || roles.includes(p.pos)))
      .filter((p) => (own === 'all' ? true : own === 'free' ? !p.owner : !!p.owner))
      .filter((p) => p.cr <= maxCr)
      .filter((p) => !qq || p.name.toLowerCase().includes(qq) || p.team.toLowerCase() === qq)
      .sort((a, b) => b[sort] - a[sort]);
  }, [players, owners, roles, own, sort, maxCr, q]);

  if (!players.length) return <Spinner />;
  const me = franchiseById[myFranchiseId];
  const bidText = (p) => `${me?.name || 'La mia franchigia'} interessati a ${p.name} ${p.team} ${p.pos} ${String(p.cr).replace(',', '.')}`;
  const maxPdk = Math.max(...players.map((p) => p.pdk));

  return (
    <div className="grid">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <h2>Giocatori</h2>
        <span className="small muted">{players.length} giocatori Dunkest{playersMeta?.updatedAt ? ` · aggiornati ${playersMeta.updatedAt.toDate().toLocaleString('it-IT')}` : ''}</span>
      </div>
      <div className="card pad grid" style={{ gap: 10 }}>
        <div className="row">
          <span className="muted"><Icon.search /></span>
          <input placeholder="Cerca giocatore o squadra (es. NOP)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filters">
          {['G', 'A', 'C'].map((r) => <button key={r} className={`fbtn ${roles.includes(r) ? 'on' : ''}`} onClick={() => setRoles((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}>{r}</button>)}
          <span style={{ width: 8 }} />
          {[['free', 'Liberi'], ['owned', 'A contratto'], ['all', 'Tutti']].map(([k, l]) => <button key={k} className={`fbtn ${own === k ? 'on' : ''}`} onClick={() => setOwn(k)}>{l}</button>)}
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="small muted">Ordina</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="small muted" style={{ marginLeft: 8 }}>CR max {maxCr}</label>
          <input type="range" min="4" max="40" step="0.5" value={maxCr} onChange={(e) => setMaxCr(+e.target.value)} style={{ width: 140, padding: 0 }} />
        </div>
      </div>

      <div className="plist">
        {list.slice(0, 200).map((p) => (
          <div key={p.id} className={`prow ${p.owner && own === 'all' ? 'owned' : ''}`} onClick={() => setSel(p)}>
            <Jersey team={p.team} number={p.num} className="jersey" />
            <div style={{ minWidth: 0 }}>
              <div className="nm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><RoleTag role={p.pos} /> {p.last.toUpperCase()} <span>{p.first}</span></div>
              <div className="bar"><i style={{ width: `${(p.pdk / maxPdk) * 100}%` }} /></div>
              <div className="sub">
                <span className="tcell" style={{ gap: 6 }}>{p.owner && <FranchiseLogo f={franchiseById[p.owner]} size={16} />}{p.owner ? franchiseById[p.owner]?.name : 'Free agent'} · {p.team}</span>
                <span>PDK {fmt(p.pdk)} · {p.gp} GP</span>
              </div>
            </div>
            <div className="cr">{fmt(p.cr)}</div>
          </div>
        ))}
        {!list.length && <p className="muted">Nessun giocatore con questi filtri.</p>}
      </div>

      {sel && (
        <Sheet onClose={() => { setSel(null); setCopied(false); }}>
          <div className="row pd-head" style={{ gap: 14 }}>
            <Jersey team={sel.team} number={sel.num} className="jersey" />
            <div><div className="small muted">{sel.first}</div><h2 style={{ fontSize: 22 }}>{sel.last}</h2><div className="small muted">{sel.pos} · {sel.team}</div></div>
            <span className={`pill ${sel.owner ? '' : 'ok'}`} style={{ marginLeft: 'auto' }}>{sel.owner ? franchiseById[sel.owner]?.name : 'Libero'}</span>
          </div>
          <div className="stat-strip" style={{ marginTop: 14 }}>
            <div><b>{fmt(sel.cr)}</b><small>CREDITI</small></div>
            <div><b>{fmt(sel.pdk)}</b><small>PDK</small></div>
            <div><b>{sel.gp}</b><small>GP</small></div>
            <div><b>{fmt(sel.min)}</b><small>MIN</small></div>
          </div>
          <div style={{ marginTop: 14 }}><PlayerDetail player={sel} /></div>
          {!sel.owner && (
            <div className="card pad" style={{ marginTop: 12, background: 'var(--surface-2)' }}>
              <div className="small muted" style={{ marginBottom: 6 }}>Messaggio per il gruppo mercato (base d'asta = valore Dunkest attuale)</div>
              <div style={{ fontWeight: 700 }}>{bidText(sel)}</div>
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(bidText(sel)).then(() => setCopied(true))}>{copied ? 'Copiato ✓' : 'Copia messaggio'}</button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
