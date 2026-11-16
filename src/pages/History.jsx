// Storico stagioni: costruito in automatico da albo d'oro, palmarès e premi; note e link ai file del Drive dal Commissioner
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../lib/data';
import { FranchiseLogo, Spinner } from '../components/ui';
import { awardsTable } from './Landing';

const AWARD_NAMES = { MVP: 'MVP', DPY: 'Difensore', ROY: 'Rookie', '6MY': 'Sesto uomo', MIP: 'Most Improved', CPY: 'Clutch', COY: 'Coach' };
export const seasonLabel = (y) => `${Number(y) - 1}/${String(y).slice(2)}`;

export function useHistoryDoc() {
  const [h, setH] = useState(undefined);
  useEffect(() => onSnapshot(doc(db, 'league', 'history'), (s) => setH(s.data() || {}), () => setH({})), []);
  return h;
}

// stagioni dal 2017 a oggi con i vincitori presi da palmarès e albo d'oro
export function buildSeasons(franchises, records, stored = {}) {
  const by = {};
  const add = (y, k, v) => { by[y] ||= { year: String(y) }; by[y][k] = v; };
  for (const [y, t] of records?.champions || []) add(y, 'champion', t);
  for (const f of franchises) {
    for (const p of f.palmares || []) {
      const m = p.match(/^\d+\s+(.*?)\s*\(([^)]+)\)/);
      if (!m) continue;
      const key = m[1].startsWith('Titolo') ? 'championFr' : m[1].startsWith('Regular') ? 'rs' : m[1].startsWith('In-Season') ? 'ist' : m[1].startsWith('Playout') ? 'playout' : null;
      if (key) m[2].split(',').forEach((y) => add(y.trim(), key, f.name));
    }
  }
  for (const a of awardsTable(franchises)) { by[a.year] ||= { year: a.year }; (by[a.year].awards ||= []).push(a); }
  const first = 2017; const last = new Date().getFullYear();
  for (let y = first; y <= last; y++) by[y] ||= { year: String(y) };
  return Object.values(by)
    .filter((s) => /^\d{4}$/.test(s.year))
    .map((s) => ({ ...s, ...(stored.seasons?.[s.year] || {}) }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

function SeasonCard({ s }) {
  const { franchises } = useData();
  const f = (name) => franchises.find((x) => x.name === name || (x.names || []).some((n) => n.startsWith(name || '¬')));
  const W = ({ label, name }) => (name ? <div className="hs-w"><small>{label}</small><span className="tcell"><FranchiseLogo f={f(name)} size={24} />{name}</span></div> : null);
  const empty = !s.champion && !s.rs && !s.ist && !s.playout && !(s.awards || []).length && !s.notes && !(s.links || []).length;
  return (
    <article className="hs-card" id={`stagione-${s.year}`}>
      <header><b className="hs-year">{seasonLabel(s.year)}</b>{s.champion && <span className="hs-champ"><FranchiseLogo f={f(s.championFr || s.champion)} size={34} /><span><small>Campione MCC</small>{s.champion}</span></span>}</header>
      <div className="hs-grid">
        <W label="Regular Season" name={s.rs} />
        <W label="In-Season Tournament" name={s.ist} />
        <W label="Playout" name={s.playout} />
      </div>
      {(s.awards || []).length > 0 && (
        <div className="hs-awards">{s.awards.map((a, i) => <span key={i} className="chip"><b>{AWARD_NAMES[a.award] || a.award}</b> {a.player} <span className="muted">· {a.team}</span></span>)}</div>
      )}
      {s.notes && <p className="small" style={{ whiteSpace: 'pre-line', margin: 0 }}>{s.notes}</p>}
      {(s.links || []).length > 0 && (
        <div className="hs-links">{s.links.map((l, i) => <a key={i} className="btn sm ghost" href={l.url} target="_blank" rel="noreferrer">{l.label || 'File'}</a>)}</div>
      )}
      {empty && <p className="small muted" style={{ margin: 0 }}>Dati di questa stagione da completare.</p>}
    </article>
  );
}

export default function History({ embedded = false }) {
  const { franchises, records } = useData();
  const stored = useHistoryDoc();
  const seasons = useMemo(() => (stored === undefined ? [] : buildSeasons(franchises, records, stored)), [franchises, records, stored]);
  const body = stored === undefined || !franchises.length ? <Spinner /> : (
    <div className="grid" style={{ gap: 14 }}>
      <nav className="hs-years" aria-label="Stagioni">{seasons.map((s) => <a key={s.year} href={`#stagione-${s.year}`} onClick={(e) => { e.preventDefault(); document.getElementById(`stagione-${s.year}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{seasonLabel(s.year)}</a>)}</nav>
      {seasons.map((s) => <SeasonCard key={s.year} s={s} />)}
      <p className="small muted">Vincitori dai palmarès ufficiali delle franchigie. Note e file delle stagioni sono curati dal Commissioner.</p>
    </div>
  );
  if (embedded) return <div className="grid"><h2>Storico</h2>{body}</div>;
  return (
    <div className="lp">
      <nav className="lp-nav"><div className="wrap lp-nav-in"><Link to="/" className="brand"><img src="/brand/mcc-logo-240.webp" alt="" className="brandmark" /> <span>MCC</span></Link><Link to="/" className="btn sm ghost" style={{ color: '#fff' }}>← Sito</Link></div></nav>
      <main className="wrap section" style={{ display: 'grid', gap: 18 }}>
        <div><div className="kicker">Milano City Championship · dal 2016</div><h2>Storico delle stagioni</h2></div>
        {body}
      </main>
    </div>
  );
}
