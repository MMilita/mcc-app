import { Link } from 'react-router-dom';
import { useData, fmt } from '../lib/data';
import { capSummary, CAP, APRON, salaryOf, keyOf } from '../lib/cap';
import { FranchiseLogo, RoleTag } from '../components/ui';
import TeamMatches from '../components/TeamMatches';
import UpdatesToast from '../components/UpdatesToast';

export function CapCard({ franchise }) {
  const c = capSummary(franchise);
  const pct = Math.min(100, (c.total / APRON) * 100);
  const label = { ok: ['Sotto il cap', 'ok'], tax: ['Luxury Tax', 'warn'], apron: ['Oltre l\'Apron', 'bad'], floor: ['Sotto il Salary Floor', 'warn'] }[c.status];
  return (
    <div className="card pad">
      <div className="row between"><h3>Salary cap 26/27</h3><span className={`pill ${label[1]}`}>{label[0]}</span></div>
      <div className="row between" style={{ marginTop: 12 }}>
        <div><div className="display num" style={{ fontSize: 28 }}>{fmt(c.total)}</div><div className="small muted">su {CAP} di cap · apron {APRON}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontWeight: 800, color: c.space >= 0 ? 'var(--mint)' : 'var(--cross)' }}>{c.space >= 0 ? '+' : ''}{fmt(c.space)}</div>
          <div className="small muted">spazio sotto i 120</div>
        </div>
      </div>
      <div className="capbar" style={{ marginTop: 10 }}><span className={c.status} style={{ width: `${pct}%` }} /></div>
      <div className="row between small muted" style={{ marginTop: 8 }}>
        <span>Contratti attivi {fmt(c.activeTotal)}</span><span>Tagliati {fmt(c.cutTotal)}</span><span>{c.players} giocatori</span>
      </div>
      {c.thirdYearRisk && <p className="small" style={{ marginBottom: 0, color: 'var(--cross)', fontWeight: 600 }}>Attenzione: sopra il cap nelle due stagioni precedenti. Un terzo anno consecutivo non è consentito: a fine Regular Season verrebbero annullati i contratti più costosi fino a rientrare (art. 3.1).</p>}
      {c.draftFloor != null && <p className="small" style={{ marginBottom: 0 }}>Sforato al FantaDraft: a fine stagione conta almeno <b>{fmt(c.draftFloor)}</b> (art. 3.1), anche se adesso sei a {fmt(c.total)}. Luxury tax calcolata su {fmt(c.counted)}.</p>}
      {c.over > 0 && <p className="small" style={{ marginBottom: 0 }}>Oltre il cap di <b>{fmt(c.over)}</b> · luxury tax stimata <b>{fmt(c.taxEuro, 2)} €</b> ({c.taxRate} € per milione{c.secondYear ? ', secondo anno consecutivo' : ''}). {c.draftFloor == null ? 'Si recupera con i tagli entro la Trade Deadline (il cap si misura a fine Regular Season).' : ''}</p>}
    </div>
  );
}

export default function Home() {
  const { profile, franchiseById, standings, config, playerByKey, user } = useData();
  const f = franchiseById[profile?.franchiseId];
  if (!f) {
    return (
      <div className="grid"><UpdatesToast /><div className="card pad">
        <h2>Ciao {user?.displayName?.split(' ')[0] || ''} 👋</h2>
        <p>Il tuo account non è ancora collegato a una franchigia. Il Commissioner lo assegnerà dalla dashboard: nel frattempo puoi consultare lega, rose e giocatori.</p>
        <div className="row"><Link className="btn" to="/app/lega">Vai alla lega</Link><Link className="btn ghost" to="/app/giocatori">Giocatori</Link></div>
      </div></div>
    );
  }
  const idx = (standings?.rows || []).findIndex((r) => r.team === f.name);
  const row = standings?.rows?.[idx];
  const match = (standings?.liveMatchday || []).find((m) => m.home === f.name || m.away === f.name);
  const roster = (f.roster || []).filter((p) => salaryOf(p) > 0);
  return (
    <div className="grid">
      <UpdatesToast />
      <section className="team-hero">
        <div className="row" style={{ gap: 14 }}><FranchiseLogo f={f} size={56} /><div style={{ minWidth: 0 }}><h2>{f.name}</h2><span className="small" style={{ opacity: 0.8 }}>{f.arena?.split('(')[0]}</span></div></div>
        <div className="kpis">
          <div className="kpi"><small>Posizione</small><b>{idx >= 0 ? idx + 1 : '–'}<span style={{ fontSize: 13, opacity: 0.7 }}>/16</span></b></div>
          <div className="kpi"><small>Record</small><b>{row ? `${row.w}-${row.l}` : '–'}</b></div>
          <div className="kpi"><small>FPT tot</small><b>{row ? fmt(row.fpt, 0) : '–'}</b></div>
        </div>
        <div className="status-bar"><span>G{config.matchday || '–'} · T {config.round || '–'}</span><span className="badge-open">SOST. APERTE</span></div>
        <Link to="/app/formazione" className="btn" style={{ width: '100%', marginTop: 12 }}>Gestisci formazione</Link>
      </section>

      {match && (
        <div className="card pad">
          <div className="kicker">Giornata {standings.matchday}</div>
          <div className="row between" style={{ marginTop: 8 }}>
            <div><div style={{ fontWeight: 700 }}>{match.home}</div><div className="display num" style={{ fontSize: 22 }}>{fmt(match.hs, 2)}</div></div>
            <span className="muted">vs</span>
            <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 700 }}>{match.away}</div><div className="display num" style={{ fontSize: 22 }}>{fmt(match.as, 2)}</div></div>
          </div>
        </div>
      )}

      <TeamMatches franchise={f} compact />

      <CapCard franchise={f} />

      <div className="card">
        <div className="row between pad" style={{ paddingBottom: 6 }}><h3>Rosa e contratti</h3><Link className="small" to={`/app/franchigia/${f.id}`}>Dettaglio →</Link></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th></th><th>Giocatore</th><th>Stip.</th><th>CR Dunkest</th><th>PDK</th></tr></thead>
            <tbody>
              {roster.map((p) => {
                const d = playerByKey[keyOf(p.name)];
                return (
                  <tr key={p.name}>
                    <td><RoleTag role={p.role} /></td>
                    <td><b>{p.name}</b> <span className="small muted">{d?.team || p.team}</span></td>
                    <td className="num">{fmt(salaryOf(p))}</td>
                    <td className="num">{d ? fmt(d.cr) : '–'}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{d ? fmt(d.pdk) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
