import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, fmt } from '../lib/data';
import { FranchiseLogo, Spinner, ZoneBadge } from '../components/ui';
import { countdown, fmtDay, fmtTime, matchdayState } from '../lib/timing';

const AWARD_NAMES = { MVP: 'MVP', DPY: 'Difensore dell\'anno', ROY: 'Rookie dell\'anno', '6MY': 'Sesto uomo', MIP: 'Most Improved', CPY: 'Clutch Player', COY: 'Coach dell\'anno' };

export function awardsTable(franchises) {
  const rows = [];
  franchises.forEach((f) => Object.entries(f.awards || {}).forEach(([award, list]) => list.forEach((s) => {
    const m = String(s).match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const player = m ? m[1] : s;
    const years = m ? m[2].split(',').map((y) => y.trim()) : [''];
    years.forEach((year) => rows.push({ award, player, year, team: f.name, fid: f.id }));
  })));
  return rows.sort((a, b) => b.year.localeCompare(a.year) || a.award.localeCompare(b.award));
}

function parsePalmares(franchises) {
  const out = { 'Titolo MCC': [], 'Regular Season': [], 'In-Season Tournament': [], Playout: [] };
  franchises.forEach((f) => (f.palmares || []).forEach((p) => {
    const m = p.match(/^\d+\s+(.*?)\s*\(([^)]+)\)/);
    if (!m) return;
    const key = Object.keys(out).find((k) => m[1].startsWith(k));
    if (key) m[2].split(',').forEach((y) => out[key].push({ year: y.trim(), team: f.name, f }));
  }));
  Object.values(out).forEach((l) => l.sort((a, b) => b.year.localeCompare(a.year)));
  return out;
}

const trophies = (f) => {
  const get = (k) => (f.palmares || []).filter((p) => p.includes(k)).reduce((s, p) => s + (parseInt(p, 10) || 0), 0);
  return { titoli: get('Titolo MCC'), rs: get('Regular Season'), ist: get('In-Season'), po: get('Playout') };
};

const SECTIONS = [['classifica', 'Classifica'], ['franchigie', 'Franchigie'], ['albo', "Albo d'oro"], ['premi', 'Premi'], ['record', 'Record']];
const SHORT = { classifica: 'Classifica', franchigie: 'Squadre', albo: 'Albo', premi: 'Premi', record: 'Record' };
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// scorrimento con accelerazione/frenata, durata in base alla distanza, offset per la barra fissa
function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const nav = document.querySelector('.lp-head');
  const offset = (nav?.offsetHeight || 64) + 12;
  const start = window.scrollY;
  const target = Math.max(0, el.getBoundingClientRect().top + start - offset);
  const dist = target - start;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const flash = () => { el.classList.remove('arrived'); void el.offsetWidth; el.classList.add('arrived'); };
  if (reduce || Math.abs(dist) < 4) { window.scrollTo(0, target); flash(); return; }
  const duration = Math.min(1100, Math.max(450, Math.abs(dist) * 0.45));
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, start + dist * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step); else flash();
  };
  requestAnimationFrame(step);
  history.replaceState(null, '', `#${id}`);
}

function useScrollSpy() {
  const [active, setActive] = useState(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      setProgress(Math.min(1, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)));
      const line = (document.querySelector('.lp-head')?.offsetHeight || 64) + 40;
      let cur = null;
      for (const [id] of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  return { active, progress };
}

function NavLinks({ active, className }) {
  const ref = useRef(null);
  // tiene visibile la voce attiva nella riga scorrevole su telefono
  useEffect(() => { ref.current?.querySelector('.on')?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [active]);
  return (
    <div className={className} ref={ref}>
      {SECTIONS.map(([id, label]) => (
        <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}
          onClick={(e) => { e.preventDefault(); smoothScrollTo(id); }}>
          <span className="full">{label}</span><span className="short" aria-hidden="true">{SHORT[id]}</span>
        </a>
      ))}
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

export default function Landing() {
  const { franchises, standings, records, config, loading, user, live } = useData();
  const [recTab, setRecTab] = useState('regularSeason');
  const [awardFilter, setAwardFilter] = useState('ALL');
  const now = useNow();
  const { active, progress } = useScrollSpy();
  // arrivo da un link con #sezione: scorre con lo stesso stile dopo il caricamento dei dati
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!loading && SECTIONS.some(([k]) => k === id)) setTimeout(() => smoothScrollTo(id), 250);
  }, [loading]);
  const awards = useMemo(() => awardsTable(franchises), [franchises]);
  const palmares = useMemo(() => parsePalmares(franchises), [franchises]);
  const byName = useMemo(() => Object.fromEntries(franchises.map((f) => [f.name, f])), [franchises]);
  const showGM = config.showGM !== false;
  const md = matchdayState(live?.schedule, now);
  const champByYear = Object.fromEntries((records?.champions || []).map(([y, t]) => [y, t]));

  return (
    <div className="lp">
      <div className="lp-head">
        <nav className="lp-nav" aria-label="Sezioni">
          <div className="wrap lp-nav-in">
            <a href="#top" className="brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); history.replaceState(null, '', '/'); }}>
              <img src="/brand/mcc-logo-240.webp" alt="" className="brandmark" /> <span>MCC</span>
            </a>
            <NavLinks active={active} className="lp-links" />
            <Link to={user ? '/app' : '/login'} className="btn sm">{user ? 'Apri l\'app' : 'Accedi'}</Link>
          </div>
        </nav>
        <NavLinks active={active} className="lp-links-mobile" />
        <div className="scroll-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      </div>

      <header className="hero2">
        <div className="wrap hero2-in">
          <div className="hero2-copy">
            <div className="eyebrow">FantaNBA · Stagione {config.season || '2026/27'} · XI edizione</div>
            <h1>{config.heroTitle || 'Milano City Championship'}</h1>
            <p>{config.heroSubtitle || 'Il FantaNBA dei quartieri di Milano.'}</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Link to={user ? '/app' : '/login'} className="btn">Entra nell'app</Link>
              <Link to="/installa" className="btn ghost">Installa sul telefono</Link>
              <Link to="/regolamento" className="btn ghost">Regolamento</Link>
            </div>
          </div>

          {/* Tabellone stile "prossime partenze" di tram e metrò */}
          <section className="board" aria-label={`Giornata ${live?.matchday?.number || standings?.matchday}`}>
            <div className="board-head">
              <span>Giornata {live?.matchday?.number || standings?.matchday}</span>
              <span>Turno {md.round}/{md.total || live?.matchday?.numRounds || '–'}</span>
              <span className={`board-status ${md.open ? 'on' : 'off'}`}>{md.label}</span>
            </div>
            {md.countdownTo && (
              <div className="board-count"><small>prossimo turno tra</small><b className="led">{countdown(md.countdownTo, now)}</b></div>
            )}
            <div className="board-rows">
              {(standings?.liveMatchday || []).map((m) => {
                const h = byName[m.home]; const a = byName[m.away];
                return (
                  <div key={m.home} className="board-row" aria-label={`${m.home} ${fmt(m.hs, 1)}, ${m.away} ${fmt(m.as, 1)}`}>
                    <span className="bteam" title={m.home}><FranchiseLogo f={h} size={26} /><span>{m.home}</span></span>
                    <b className={`led ${m.hs > m.as ? 'win' : ''}`}>{fmt(m.hs, 1)}</b>
                    <i className="dash" aria-hidden="true">–</i>
                    <b className={`led ${m.as > m.hs ? 'win' : ''}`}>{fmt(m.as, 1)}</b>
                    <span className="bteam right" title={m.away}><span>{m.away}</span><FranchiseLogo f={a} size={26} /></span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <div className="logo-wall wrap" aria-hidden="true">
          {franchises.map((f) => <FranchiseLogo key={f.id} f={f} size={44} />)}
        </div>
      </header>

      {loading ? <Spinner /> : (
        <>
          {(config.announcements || []).length > 0 && (
            <section className="wrap notice-strip">
              {config.announcements.map((a, i) => (
                <div key={i} className="notice"><span className="pill warn">Comunicato</span><span>{a.text}</span><time className="muted small">{a.date}</time></div>
              ))}
            </section>
          )}

          <section className="section wrap" id="classifica">
            <div className="section-head">
              <div><div className="kicker">Regular Season {standings?.season}</div><h2>Classifica</h2></div>
              <p className="muted small">Dopo la giornata {standings?.matchday} · 1ª-6ª Playoff · 7ª-10ª Play-In · 11ª-16ª Playout</p>
            </div>
            <div className="card table-wrap">
              <table className="standings">
                <thead><tr><th>#</th><th>Franchigia</th><th>V</th><th>P</th><th className="hide-sm">%</th><th style={{ textAlign: 'right' }}>FPT</th></tr></thead>
                <tbody>
                  {(standings?.rows || []).map((r, i) => {
                    const f = byName[r.team];
                    const zone = i < 6 ? 'po' : i < 10 ? 'pi' : 'pl';
                    return (
                      <tr key={r.team} className={`z-${zone}`}>
                        <td className="num pos">{i + 1}</td>
                        <td><span className="tcell"><FranchiseLogo f={f} size={30} /><span><b>{r.team}</b>{showGM && f?.gm && <small className="muted">{f.gm}</small>}</span></span></td>
                        <td className="num">{r.w}</td>
                        <td className="num">{r.l}</td>
                        <td className="num hide-sm">{(r.w / Math.max(1, r.w + r.l)).toFixed(3).slice(1)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmt(r.fpt, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section band" id="franchigie">
            <div className="wrap">
              <div className="section-head"><div><div className="kicker">Quartieri e arene</div><h2>Le 16 franchigie</h2></div></div>
              <div className="fr-grid2">
                {franchises.map((f) => {
                  const t = trophies(f);
                  return (
                    <article key={f.id} className="fcard">
                      <div className="fcard-top">
                        <FranchiseLogo f={f} size={72} />
                        <div style={{ minWidth: 0 }}>
                          <h3>{f.name}</h3>
                          <div className="small muted row" style={{ gap: 6, marginTop: 4 }}>
                            <ZoneBadge zona={f.zona} /><span>{f.quartiere || 'Milano'}{f.founded ? ` · dal ${f.founded}` : ''}</span>
                          </div>
                        </div>
                      </div>
                      <dl className="fmeta">
                        {showGM && f.gm && <><dt>GM</dt><dd>{f.gm}</dd></>}
                        {f.arena && <><dt>Arena</dt><dd>{f.arena.replace(/\s*\(.*\)/, '')}</dd></>}
                        {f.colors && <><dt>Colori</dt><dd>{f.colors}</dd></>}
                      </dl>
                      <div className="trophy-row">
                        <span className={t.titoli ? 'gold' : ''} title="Titoli MCC"><b>{t.titoli}</b>Titoli</span>
                        <span title="Regular Season"><b>{t.rs}</b>RS</span>
                        <span title="In-Season Tournament"><b>{t.ist}</b>IST</span>
                        <span title="Playout vinti"><b>{t.po}</b>Playout</span>
                      </div>
                      {f.names?.length > 1 && <p className="small muted ex">Prima: {f.names.slice(0, -1).map((n) => n.replace(/\s*\(.*\)/, '')).join(' · ')}</p>}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="section wrap" id="albo">
            <div className="section-head"><div><div className="kicker">Palmarès</div><h2>Albo d'oro</h2></div><Link to="/storico" className="btn sm ghost">Storico stagione per stagione →</Link></div>
            <ol className="champions">
              {(records?.champions || []).slice().sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(([y, t]) => {
                const f = franchises.find((x) => (x.names || []).some((n) => n.startsWith(t)) || x.name === t);
                return (
                  <li key={y}>
                    <span className="year">{y}</span>
                    <FranchiseLogo f={f} size={52} />
                    <b>{t}</b>
                    {f && f.name !== t && <small className="muted">oggi {f.name}</small>}
                  </li>
                );
              })}
            </ol>
            <div className="albo-grid">
              {[['Regular Season', 'Vincitori Regular Season'], ['In-Season Tournament', 'In-Season Tournament'], ['Playout', 'Vincitori Playout']].map(([k, label]) => (
                <div key={k} className="card">
                  <h3 className="pad" style={{ paddingBottom: 4 }}>{label}</h3>
                  <table><tbody>
                    {palmares[k].map((r) => <tr key={r.year + r.team}><td className="num muted" style={{ width: 56 }}>{r.year}</td><td><span className="tcell"><FranchiseLogo f={r.f} size={22} />{r.team}</span></td></tr>)}
                  </tbody></table>
                </div>
              ))}
            </div>
            {Object.keys(champByYear).length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Titoli assegnati con il nome della franchigia nell'anno della vittoria.</p>}
          </section>

          <section className="section band" id="premi">
            <div className="wrap">
              <div className="section-head">
                <div><div className="kicker">Fino ad oggi</div><h2>Premi individuali</h2><p className="muted small">Premi NBA vinti da giocatori a roster: 16 € a premio alla franchigia.</p></div>
                <div className="tabs" role="tablist">
                  {['ALL', ...Object.keys(AWARD_NAMES)].map((k) => <button key={k} role="tab" aria-selected={awardFilter === k} className={`tab ${awardFilter === k ? 'on' : ''}`} onClick={() => setAwardFilter(k)}>{k === 'ALL' ? 'Tutti' : k}</button>)}
                </div>
              </div>
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>Anno</th><th>Premio</th><th>Giocatore</th><th>Franchigia</th></tr></thead>
                  <tbody>
                    {awards.filter((a) => awardFilter === 'ALL' || a.award === awardFilter).map((a, i) => (
                      <tr key={i}><td className="num">{a.year}</td><td><span className="pill">{a.award}</span> <span className="small muted hide-sm">{AWARD_NAMES[a.award]}</span></td><td style={{ fontWeight: 600 }}>{a.player}</td><td><span className="tcell"><FranchiseLogo f={byName[a.team]} size={22} /><span className="hide-sm">{a.team}</span></span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="section wrap" id="record">
            <div className="section-head">
              <div><div className="kicker">All time · dal 2016</div><h2>Record</h2></div>
              <div className="tabs" role="tablist">
                {[['regularSeason', 'Regular Season'], ['playoff', 'Playoff'], ['finals', 'Finals']].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={recTab === k} className={`tab ${recTab === k ? 'on' : ''}`} onClick={() => setRecTab(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="rec-grid">
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>Squadra</th><th>Stag.</th><th>GP</th><th>V-P</th><th>Pct</th></tr></thead>
                  <tbody>
                    {(records?.[recTab] || []).map((r) => (
                      <tr key={r[0]}><td style={{ fontWeight: 600 }}>{r[0]}</td><td className="num">{r[1]}</td><td className="num">{r[2]}</td><td className="num">{r[3]}</td><td className="num">{Number(r[4]).toFixed(3).slice(1)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card table-wrap">
                <table><tbody>
                  {(records?.teamRecords?.[{ regularSeason: 'Regular Season', playoff: 'Playoff', finals: 'Finals' }[recTab]] || []).map(([k, v]) => (
                    <tr key={k}><td className="small muted" style={{ width: '44%' }}>{k}</td><td style={{ fontWeight: 600 }}>{v}</td></tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          </section>
        </>
      )}

      <footer className="footer">
        <div className="wrap row between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <span className="brand"><img src="/brand/mcc-logo-240.webp" alt="" className="brandmark" /> Milano City Championship</span>
          <span className="row" style={{ gap: 14 }}><Link to="/regolamento" style={{ color: '#fff' }}>Regolamento ufficiale</Link><Link to="/storico" style={{ color: '#fff' }}>Storico</Link><Link to="/installa" style={{ color: '#fff' }}>Installa l'app</Link></span>
          <span style={{ opacity: 0.7 }}>Calendario e statistiche: Dunkest{live?.updatedAt ? ` · aggiornato ${fmtDay(live.updatedAt.toDate().toISOString())} ${fmtTime(live.updatedAt.toDate().toISOString())}` : ''} · uso privato della lega</span>
        </div>
      </footer>
    </div>
  );
}
