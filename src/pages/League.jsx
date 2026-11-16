import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, fmt } from '../lib/data';
import { capSummary, roleCounts, CAP } from '../lib/cap';
import { FranchiseLogo } from '../components/ui';
import { awardsTable } from './Landing';
import LeagueCalendar from '../components/LeagueCalendar';
import Tournaments from '../components/Tournaments';

export default function League() {
  const { standings, franchises, franchiseById, records } = useData();
  const [tab, setTab] = useState('classifica');
  const byName = Object.fromEntries(franchises.map((f) => [f.name, f]));
  return (
    <div className="grid">
      <h2>Lega</h2>
      <div className="tabs">
        {[['classifica', 'Classifica'], ['calendario', 'Calendario'], ['tornei', 'Tornei'], ['cap', 'Salary cap'], ['premi', 'Premi'], ['record', 'Record']].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'classifica' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>#</th><th>Franchigia</th><th>W-L</th><th>FPT</th></tr></thead>
            <tbody>
              {(standings?.rows || []).map((r, i) => {
                const f = byName[r.team];
                return (
                  <tr key={r.team}>
                    <td className="num muted">{i + 1}</td>
                    <td><span className="tcell"><FranchiseLogo f={f} size={30} /><span>{f ? <Link to={`/app/franchigia/${f.id}`} style={{ fontWeight: 700, textDecoration: 'none' }}>{r.team}</Link> : r.team}<small className="muted">{f?.gm}</small></span></span></td>
                    <td className="num">{r.w}-{r.l}</td>
                    <td className="num">{fmt(r.fpt, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted" style={{ padding: '4px 12px 12px', margin: 0 }}>Giornata {standings?.matchday} · 1ª-6ª Playoff · 7ª-10ª Play-In · 11ª-16ª Playout</p>
        </div>
      )}

      {tab === 'calendario' && <LeagueCalendar />}
      {tab === 'tornei' && <Tournaments />}

      {tab === 'cap' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Franchigia</th><th>Totale 26/27</th><th>Spazio</th><th className="hide-sm">Fine Draft</th><th>Tax €</th><th className="hide-sm">Rosa</th><th className="hide-sm">G/A/C</th></tr></thead>
            <tbody>
              {franchises.map((f) => {
                const c = capSummary(f); const rc = roleCounts((f.roster || []).filter((p) => p.salaries?.['2026/2027']));
                                return (
                  <tr key={f.id}>
                    <td><span className="tcell"><FranchiseLogo f={f} size={24} /><Link to={`/app/franchigia/${f.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{f.name}</Link></span></td>
                    <td className="num">{fmt(c.total)}</td>
                    <td className="num" style={{ color: c.space >= 0 ? 'var(--mint)' : 'var(--cross)', fontWeight: 700 }}>{c.space >= 0 ? '+' : ''}{fmt(c.space)}</td>
                    <td className="num hide-sm">{c.draftTotal != null ? fmt(c.draftTotal) : '–'}</td>
                    <td className="num" style={{ color: c.taxEuro ? 'var(--cross)' : undefined }}>{c.taxEuro ? fmt(c.taxEuro, 1) : '–'}</td>
                    <td className="num hide-sm">{c.players}</td>
                    <td className="num small hide-sm">{rc.G || 0}/{rc.A || 0}/{rc.C || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted" style={{ padding: '4px 12px 12px', margin: 0 }}>Cap {CAP} calcolato a fine Regular Season, mai sotto il totale di fine Draft se sforato (art. 3.1) · tagliati al 50% · Injury List al 10% · Luxury Tax 1 € per milione (2 € al 2° anno consecutivo).</p>
        </div>
      )}

      {tab === 'premi' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Anno</th><th>Premio</th><th>Giocatore</th><th>Franchigia</th></tr></thead>
            <tbody>{awardsTable(franchises).map((a, i) => <tr key={i}><td className="num">{a.year}</td><td><span className="pill">{a.award}</span></td><td>{a.player}</td><td>{a.team}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === 'record' && (
        <div className="grid">
          {Object.entries(records?.teamRecords || {}).map(([k, rows]) => (
            <div key={k} className="card table-wrap">
              <div className="pad" style={{ paddingBottom: 0 }}><h3>{k}</h3></div>
              <table><tbody>{rows.map(([a, b]) => <tr key={a}><td className="small muted" style={{ width: '45%' }}>{a}</td><td style={{ fontWeight: 600 }}>{b}</td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      )}
      <div className="small muted">Franchigie: {franchises.length} · {Object.keys(franchiseById).length && 'dati dai fogli ufficiali della lega'}</div>
    </div>
  );
}
