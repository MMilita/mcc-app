import { Link, useParams } from 'react-router-dom';
import { useData, fmt } from '../lib/data';
import { cutCharge, isRookieScale, keyOf } from '../lib/cap';
import { FranchiseLogo, RoleTag, Spinner, franchiseColors } from '../components/ui';
import { CapCard } from './Home';
import TeamMatches, { LastLineupButton } from '../components/TeamMatches';

const SEASONS = ['2025/2026', '2026/2027', '2027/2028', '2028/2029', '2029/2030'];

export default function Franchise() {
  const { fid } = useParams();
  const { franchiseById, playerByKey, config } = useData();
  const f = franchiseById[fid];
  if (!f) return <Spinner />;
  const cols = franchiseColors(f.colors);
  const showGM = config.showGM !== false;
  const order = { G: 0, A: 1, C: 2, '?': 3 };
  const roster = (f.roster || []).slice().sort((a, b) => order[a.role] - order[b.role]);
  return (
    <div className="grid">
      <section className="team-hero" style={{ background: `linear-gradient(135deg, var(--ink) 0%, var(--ink-3) 60%, ${cols[0]} 160%)` }}>
        <div className="row" style={{ gap: 14 }}><FranchiseLogo f={f} size={64} /><h2>{f.name}</h2></div>
        <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>
          {showGM && f.gm && <>GM {f.gm} · </>}{[f.quartiere, f.zona].filter((x) => x && x !== '-').join(' · ')}{f.founded ? ` · fondata nel ${f.founded}` : ''}
        </div>
        {f.arena && <div className="small" style={{ opacity: 0.75, marginTop: 4 }}>Arena: {f.arena}</div>}
        <div className="chips">{(f.palmares || []).map((p) => <span key={p} className="chip" style={{ background: 'rgba(255,255,255,.12)', borderColor: 'transparent' }}>{p}</span>)}</div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Link className="btn sm" to={`/app/formazione/${f.id}`}>Formazione nell'app</Link>
          <LastLineupButton franchise={f} />
        </div>
      </section>
      <div className="card table-wrap">
        <div className="pad" style={{ paddingBottom: 0 }}><h3>Contratti</h3></div>
        <table>
          <thead><tr><th></th><th>Giocatore</th>{SEASONS.map((s) => <th key={s} className="num">{s.slice(2, 4)}/{s.slice(7)}</th>)}<th>PDK</th></tr></thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.name}>
                <td><RoleTag role={p.role} /></td>
                <td style={{ whiteSpace: 'nowrap' }}><b>{p.name}</b> <span className="small muted">{p.team}</span></td>
                {SEASONS.map((s) => <td key={s} className="num">{p.salaries?.[s] ? fmt(p.salaries[s]) : ''}</td>)}
                <td className="num" style={{ fontWeight: 700 }}>{fmt(playerByKey[keyOf(p.name)]?.pdk)}</td>
              </tr>
            ))}
            {(f.cut || []).map((p) => (
              <tr key={`cut-${p.name}`} style={{ opacity: 0.6 }}>
                <td><span className="pill bad">T</span></td>
                <td><s>{p.name}</s> <span className="small muted">tagliato (50%{isRookieScale(p) ? ', TO non garantite a 0' : ''})</span></td>
                {SEASONS.map((s) => <td key={s} className="num">{p.salaries?.[s] ? fmt(cutCharge(p, s)) : ''}</td>)}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CapCard franchise={f} />
      <TeamMatches franchise={f} />
      {f.names?.length > 0 && (
        <div className="card pad"><h3>Storia</h3><ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{f.names.map((n) => <li key={n}>{n}</li>)}</ul></div>
      )}
    </div>
  );
}
