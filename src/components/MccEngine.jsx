// Dashboard del Commissioner: motore "MCC stats" (box score NBA + CBS) confrontato con Dunkest.
// Legge mccstats/* scritto da scripts/sync-mcc-stats.mjs. Solo lettura.
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Spinner } from './ui';

const FIELD_LABEL = {
  gp: 'Partite', min: 'Minuti', starter: 'Titolare', pdk: 'PDK', pts: 'Punti', reb: 'Rimbalzi', oreb: 'Rimb. off.', dreb: 'Rimb. dif.',
  ast: 'Assist', stl: 'Rubate', blk: 'Stoppate', blka: 'Stopp. subite', fgm: 'Tiri segnati', fga: 'Tiri tentati', fgp: 'Tiro %',
  tpm: 'Triple segn.', tpa: 'Triple tent.', tpp: 'Triple %', ftm: 'Liberi segn.', fta: 'Liberi tent.', ftp: 'Liberi %',
  tov: 'Palle perse', pf: 'Falli fatti', fouls_received: 'Falli subiti', plus_minus: '+/−',
};
// voci che entrano nel PDK (le altre sono solo informative)
const IN_PDK = new Set(['pdk', 'pts', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'blka', 'fgm', 'fga', 'tpm', 'ftm', 'fta', 'tov', 'starter']);

const pct = (ok, n) => (n ? (ok / n) * 100 : null);
const fmtPct = (v, d = 1) => (v == null ? '–' : `${v.toFixed(d).replace('.', ',')}%`);
const level = (v) => (v == null ? '' : v >= 99 ? 'ok' : v >= 95 ? 'warn' : 'bad');
const LEVEL_TXT = { ok: '✓ in linea', warn: '△ da tenere d\'occhio', bad: '✕ divergente' };

// Timestamp Firestore, stringa ISO o millisecondi → Date
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const when = (v) => toDate(v)?.toLocaleString('it-IT') || '–';

function useMcc(id) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    if (!id) { setD(null); return undefined; }
    setD(undefined);
    // modalità test E2E (solo `vite dev`): dati da e2e/mccstats.json, esclusi dalla build
    if (import.meta.env.DEV && (() => { try { return localStorage.getItem('mcc-e2e') === '1'; } catch { return false; } })()) {
      let alive = true;
      import('../../e2e/mccstats.json').then((m) => alive && setD(m.default[id] ?? null)).catch(() => alive && setD(null));
      return () => { alive = false; };
    }
    return onSnapshot(doc(db, 'mccstats', id), (s) => setD(s.exists() ? s.data() : null), () => setD(null));
  }, [id]);
  return d;
}

function Tile({ label, value, sub, lvl }) {
  return (
    <div className="mcc-tile">
      <div className="mcc-tile-label">{label}</div>
      <div className="mcc-tile-value">{value}</div>
      {lvl && <span className={`pill ${lvl}`}>{LEVEL_TXT[lvl]}</span>}
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

// barra orizzontale con percentuale; scala 90-100% perché le differenze stanno tutte lì
function Meter({ v, min = 90 }) {
  const w = v == null ? 0 : Math.max(2, ((Math.max(v, min) - min) / (100 - min)) * 100);
  return <span className="mcc-meter" title={fmtPct(v, 2)}><i style={{ width: `${w}%` }} /></span>;
}

// colonne giornaliere: % valori identici (scala 90-100), tooltip al passaggio
function DayChart({ days, onPick, picked }) {
  const [hover, setHover] = useState(null);
  const H = 120, min = 90;
  if (!days.length) return null;
  const h = (v) => Math.max(3, ((Math.max(v, min) - min) / (100 - min)) * H);
  const cur = hover ?? days.find((d) => d.date === picked) ?? days[days.length - 1];
  return (
    <div>
      <div className="mcc-chart-head small">
        <b>{new Date(`${cur.date}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        {' · '}valori identici {fmtPct(cur.v, 2)} · PDK identici {fmtPct(cur.pdk, 1)} · {cur.games} partite
      </div>
      <div className="mcc-chart" style={{ height: H }} role="img" aria-label="Percentuale di statistiche identiche a Dunkest per giorno">
        {[100, 95, 90].map((g) => <div key={g} className="mcc-grid" style={{ bottom: h(g) - (g === 90 ? 3 : 0) }}><span>{g}%</span></div>)}
        <div className="mcc-cols">
          {days.map((d) => (
            <button key={d.date} type="button" className={`mcc-col ${picked === d.date ? 'on' : ''}`}
              onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d)} onBlur={() => setHover(null)}
              onClick={() => onPick(d.date)} aria-label={`${d.date}: ${fmtPct(d.v, 2)}`}>
              <i style={{ height: h(d.v) }} />
            </button>
          ))}
        </div>
      </div>
      <div className="mcc-axis small muted"><span>{days[0].date.slice(5).split('-').reverse().join('/')}</span><span>{days.at(-1).date.slice(5).split('-').reverse().join('/')}</span></div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>Tocca una colonna per vedere le differenze di quel giorno, giocatore per giocatore.</p>
    </div>
  );
}

function Mismatches({ list, filter, setFilter }) {
  const rows = useMemo(() => (list || []).map((m) => { const [n, t, f, o, d] = m.split('|'); return { n, t, f, o, d }; }), [list]);
  const fields = [...new Set(rows.map((r) => r.f))];
  const shown = rows.filter((r) => !filter || r.f === filter);
  if (!rows.length) return <p className="small muted">Nessuna differenza: tutte le statistiche coincidono con Dunkest.</p>;
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
        <button type="button" className={`tab ${!filter ? 'on' : ''}`} onClick={() => setFilter('')}>Tutte ({rows.length})</button>
        {fields.map((f) => <button key={f} type="button" className={`tab ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{FIELD_LABEL[f] || f} ({rows.filter((r) => r.f === f).length})</button>)}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Giocatore</th><th>Voce</th><th className="num">MCC (NBA)</th><th className="num">Dunkest (OPTA)</th><th className="num">Diff.</th></tr></thead>
        <tbody>{shown.slice(0, 300).map((r, i) => (
          <tr key={i}><td>{r.n} <span className="small muted">{r.t}</span></td><td>{FIELD_LABEL[r.f] || r.f}{IN_PDK.has(r.f) ? '' : <span className="small muted"> · fuori PDK</span>}</td>
            <td className="num">{r.o}</td><td className="num">{r.d}</td><td className="num">{(Number(r.o) - Number(r.d) > 0 ? '+' : '') + (Math.round((Number(r.o) - Number(r.d)) * 100) / 100).toString().replace('.', ',')}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

function FieldTable({ fields }) {
  const list = Object.entries(fields || {}).map(([f, x]) => ({ f, ok: x.ok, n: x.n, v: pct(x.ok, x.n) })).sort((a, b) => a.v - b.v);
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Statistica</th><th className="num">Identiche</th><th style={{ width: '40%' }}>90% → 100%</th></tr></thead>
      <tbody>{list.map((x) => (
        <tr key={x.f}><td>{FIELD_LABEL[x.f] || x.f}{IN_PDK.has(x.f) ? '' : <span className="small muted"> · fuori PDK</span>}</td>
          <td className="num">{fmtPct(x.v, 1)} <span className="small muted">{x.ok}/{x.n}</span></td><td><Meter v={x.v} /></td></tr>
      ))}</tbody>
    </table></div>
  );
}

function MatchdayDetail({ number }) {
  const md = useMcc(`md_${number}`);
  const [onlyDiff, setOnlyDiff] = useState(true);
  if (md === undefined) return <Spinner />;
  if (!md) return <p className="small muted">Dettaglio non disponibile.</p>;
  const F = md.fields;
  const rows = md.rows.map((r) => Object.fromEntries(r.split('|').map((v, i) => [F[i], v])));
  const diff = (r) => r.dkDelta !== '' && Math.abs(Number(r.dkDelta) - Number(r.delta)) > 0.05;
  const shown = rows.filter((r) => !onlyDiff || diff(r) || (r.dkFpt !== '' && (r.giocato === '1' || r.dkGiocato === '1') && Math.abs(Number(r.dkFpt) - Number(r.fpt)) > 0.006))
    .sort((a, b) => Number(diff(b)) - Number(diff(a)) || Number(b.fpt) - Number(a.fpt));
  return (
    <div>
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <p className="small muted" style={{ margin: 0 }}>Giornata {md.number} · {md.dates.map((d) => d.slice(5).split('-').reverse().join('/')).join(', ')} · {md.games} partite · {md.mode === 'backtest' ? 'backtest: crediti di partenza Dunkest' : 'crediti MCC calcolati in autonomia'}</p>
        <label className="switch small"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> solo differenze</label>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Giocatore</th><th className="num">PDK MCC</th><th className="num">PDK Dunkest</th><th className="num">Cr. prima</th><th className="num">Δ MCC</th><th className="num">Δ Dunkest</th>{md.mode === 'live' && <th className="num">Cr. Dunkest</th>}<th>Note</th></tr></thead>
        <tbody>{shown.slice(0, 400).map((r) => (
          <tr key={r.nbaId} className={diff(r) ? 'mcc-diff' : ''}>
            <td>{r.nome} <span className="small muted">{r.squadra}</span></td>
            <td className="num">{r.giocato === '1' ? r.fpt : '–'}</td><td className="num">{r.dkGiocato === '1' ? r.dkFpt : r.dkFpt === '' ? '?' : '–'}</td>
            <td className="num">{r.crPrima}</td><td className="num">{r.delta}</td><td className="num">{r.dkDelta === '' ? '?' : r.dkDelta}</td>
            {md.mode === 'live' && <td className="num">{r.dkCrPrima || '?'}</td>}
            <td className="small muted">{r.giocato === '1' ? '' : (r.motivoNBA || '').replace(/_/g, ' ').toLowerCase()}{r.fuoriCBS === '1' ? ' · CBS: fuori' : ''}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {!shown.length && <p className="small muted">Nessuna differenza in questa giornata.</p>}
    </div>
  );
}

function Injuries() {
  const inj = useMcc('injuries');
  if (inj === undefined) return <Spinner />;
  if (!inj) return <p className="small muted">Nessuna fotografia CBS ancora salvata.</p>;
  const c = inj.compare || {};
  const rows = (inj.rows || []).map((r) => { const [id, name, team, injury, status, updated] = r.split('|'); return { id, name, team, injury, status, updated }; });
  const Block = ({ title, list, note }) => (
    <div><b>{title}</b> <span className="small muted">({(list || []).length}) {note}</span>
      <div className="small" style={{ marginTop: 4 }}>{(list || []).join(', ') || '—'}</div></div>
  );
  return (
    <div className="grid">
      <p className="small muted" style={{ margin: 0 }}>Fonte: CBS Sports NBA Injury Report, fotografia del {inj.date}. Confronto con il flag "infortunato" dei profili Dunkest. Nota: Dunkest non congela i crediti degli infortunati (chi non gioca perde 0,1), quindi CBS serve come informazione, non per i crediti.</p>
      <Block title="Fuori per entrambi" list={c.both} />
      <Block title="Fuori per CBS, non per Dunkest" list={c.cbsOnly} />
      <Block title="Infortunati per Dunkest, non fuori per CBS" list={c.dkOnly} note="(possono essere in dubbio o già rientrati)" />
      <details><summary className="small">Elenco completo CBS ({rows.length})</summary>
        <div className="table-wrap"><table>
          <thead><tr><th>Giocatore</th><th>Infortunio</th><th>Stato</th><th>Aggiornato</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{r.name} <span className="small muted">{r.team}</span>{!r.id && <span className="pill warn">non abbinato</span>}</td><td>{r.injury}</td><td className="small">{r.status}</td><td className="small muted">{r.updated}</td></tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}

export default function MccEngine() {
  const meta = useMcc('meta');
  const season = useMcc('season');
  const [day, setDay] = useState(null);
  const [md, setMd] = useState(null);
  const [view, setView] = useState('overview');
  const [filter, setFilter] = useState('');
  const dayDoc = useMcc(day ? `day_${day}` : null);

  const days = useMemo(() => Object.entries(meta?.days || {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, x]) => ({ date, v: pct(x.values.ok, x.values.n), pdk: pct(x.pdk?.ok, x.pdk?.n), games: x.games, onlyDk: x.onlyDk, onlyOurs: x.onlyOurs })), [meta]);
  const mds = useMemo(() => Object.entries(meta?.mds || {}).map(([n, s]) => ({ ...s, players: s.n, n: Number(n) })).sort((a, b) => b.n - a.n), [meta]);

  if (meta === undefined) return <Spinner />;
  if (!meta) return <div className="card pad"><h3>Motore MCC</h3><p className="muted">Il motore non ha ancora girato. Avvialo da GitHub → Actions → "MCC stats" → Run workflow.</p></div>;

  const pdkAll = Object.values(meta.days || {}).reduce((a, x) => ({ ok: a.ok + (x.pdk?.ok || 0), n: a.n + (x.pdk?.n || 0) }), { ok: 0, n: 0 });
  const valAll = Object.values(meta.days || {}).reduce((a, x) => ({ ok: a.ok + x.values.ok, n: a.n + x.values.n }), { ok: 0, n: 0 });
  const plusAll = mds.reduce((a, x) => ({ ok: a.ok + (x.plusOk || 0), n: a.n + (x.plusN || 0) }), { ok: 0, n: 0 });
  const live = mds.filter((m) => m.mode === 'live');
  const lastLive = live[0];
  const pdkPct = pct(pdkAll.ok, pdkAll.n), valPct = pct(valAll.ok, valAll.n), plusPct = pct(plusAll.ok, plusAll.n);
  const crPct = lastLive ? pct(lastLive.crOk, lastLive.crN) : null; // prima della G{startMd} chiusa coincidono per costruzione

  return (
    <div className="grid mcc">
      <div className="card pad">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div><h3 style={{ margin: 0 }}>Motore MCC vs Dunkest</h3>
            <p className="small muted" style={{ margin: '4px 0 0' }}>Statistiche dai box score ufficiali NBA, infortuni da CBS Sports, formule Dunkest replicate. Dunkest usa OPTA: le piccole differenze sono valutazioni diverse degli statistici, non errori di calcolo.</p></div>
          <span className="small muted">Aggiornato {when(meta.updatedAt)} · consolidato fino al {meta.lastDate || '–'}</span>
        </div>
        <div className="mcc-tiles">
          <Tile label="PDK per partita" value={fmtPct(pdkPct, 2)} sub={`${pdkAll.ok}/${pdkAll.n} prestazioni identiche`} lvl={level(pdkPct)} />
          <Tile label="Tutte le statistiche" value={fmtPct(valPct, 2)} sub={`${valAll.ok.toLocaleString('it-IT')}/${valAll.n.toLocaleString('it-IT')} valori (25 voci × giocatore × giorno)`} lvl={level(valPct)} />
          <Tile label="Variazione crediti" value={fmtPct(plusPct, 1)} sub={`${plusAll.ok}/${plusAll.n} · giornate ${mds.map((m) => m.n).sort((a, b) => a - b)[0] ?? '–'}-${mds[0]?.n ?? '–'}`} lvl={level(plusPct)} />
          <Tile label="Crediti MCC = Dunkest" value={lastLive ? fmtPct(crPct, 1) : 'In attesa'}
            sub={lastLive ? `inizio G${lastLive.n} · entro 0,1: ${fmtPct(pct(lastLive.cr01, lastLive.crN), 1)} · scarto max ${String(lastLive.crMax).replace('.', ',')}`
              : `I crediti MCC partono da quelli Dunkest del ${toDate(meta.seededAt)?.toLocaleDateString('it-IT')} e da lì evolvono da soli: il primo confronto vero arriva a fine G${meta.startMd} consolidata.`}
            lvl={lastLive ? level(crPct) : null} />
        </div>
        {meta.warnings?.length > 0 && <details className="small" style={{ marginTop: 10 }}><summary><span className="pill warn">{meta.warnings.length} avvisi</span></summary><ul>{meta.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      </div>

      <div className="tabs">{[['overview', 'Per giorno'], ['fields', 'Per statistica'], ['mds', 'Giornate e crediti'], ['inj', 'Infortuni CBS'], ['how', 'Come funziona']].map(([k, l]) =>
        <button key={k} type="button" className={`tab ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{l}</button>)}</div>

      {view === 'overview' && (
        <div className="card pad">
          <h4 style={{ marginTop: 0 }}>Statistiche identiche a Dunkest, giorno per giorno</h4>
          <DayChart days={days} picked={day} onPick={(d) => { setDay(d); setFilter(''); }} />
          {day && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 4px' }}>Differenze del {day.split('-').reverse().join('/')}</h4>
              {dayDoc === undefined ? <Spinner /> : !dayDoc ? <p className="small muted">Nessun dato.</p> : (
                <>
                  <p className="small muted" style={{ margin: 0 }}>{dayDoc.finals}/{dayDoc.games} partite · {dayDoc.players?.compared} giocatori confrontati, {dayDoc.players?.allOk} identici in tutto · PDK {dayDoc.fields?.pdk?.ok}/{dayDoc.fields?.pdk?.n}</p>
                  {(dayDoc.onlyDk?.length > 0 || dayDoc.onlyOurs?.length > 0) && <p className="small">{dayDoc.onlyDk?.length > 0 && <>Solo in Dunkest: {dayDoc.onlyDk.join(', ')}. </>}{dayDoc.onlyOurs?.length > 0 && <>Solo nei box score NBA: {dayDoc.onlyOurs.join(', ')}.</>}</p>}
                  <Mismatches list={dayDoc.mismatches} filter={filter} setFilter={setFilter} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'fields' && (
        <div className="card pad">
          <h4 style={{ marginTop: 0 }}>Medie stagionali per statistica {season?.until ? `(fino al ${season.until.split('-').reverse().join('/')})` : ''}</h4>
          <p className="small muted">Giocatori con la media identica a Dunkest per ogni voce. {season ? `${season.players?.allOk}/${season.players?.compared} giocatori identici in tutte le voci.` : ''}</p>
          {season === undefined ? <Spinner /> : <FieldTable fields={season?.fields || meta.season?.fields} />}
          {season?.mismatches?.length > 0 && <details style={{ marginTop: 10 }}><summary className="small">Differenze sulle medie ({season.mismatchCount})</summary><Mismatches list={season.mismatches} filter={filter} setFilter={setFilter} /></details>}
        </div>
      )}

      {view === 'mds' && (
        <div className="card pad">
          <h4 style={{ marginTop: 0 }}>Giornate fantasy: PDK della prima partita e variazione crediti</h4>
          <p className="small muted">Per ogni giornata conta la prima partita della squadra. Variazione = (PDK − 1,95 × crediti) / 80 arrotondata a 0,1; chi non gioca −0,1; minimo 4,0. <b>Backtest</b> = crediti di partenza presi da Dunkest per misurare la formula; <b>autonomo</b> = crediti calcolati solo dal motore MCC.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Giornata</th><th>Modo</th><th className="num">PDK prima partita</th><th className="num">Δ crediti</th><th className="num">Crediti = Dunkest</th><th className="num">Non giocato: −0,1</th><th /></tr></thead>
            <tbody>{mds.map((m) => (
              <tr key={m.n} className={md === m.n ? 'mcc-sel' : ''}>
                <td><b>G{m.n}</b></td><td><span className={`pill ${m.mode === 'live' ? 'ok' : ''}`}>{m.mode === 'live' ? 'autonomo' : 'backtest'}</span></td>
                <td className="num">{fmtPct(pct(m.fptOk, m.fptN))} <span className="small muted">{m.fptOk}/{m.fptN}</span></td>
                <td className="num">{fmtPct(pct(m.plusOk, m.plusN))} <span className="small muted">{m.plusOk}/{m.plusN}</span></td>
                <td className="num">{m.mode === 'live' ? <>{fmtPct(pct(m.crOk, m.crN))} <span className="small muted">max {m.crMax}</span></> : '–'}</td>
                <td className="num">{m.dnp ? <>{fmtPct(pct(m.noFreezeOk ?? m.dnp - m.dkFrozen, m.dnp))} <span className="small muted">{m.dkFrozen} congelati</span></> : '–'}</td>
                <td><button type="button" className="tab" onClick={() => setMd(md === m.n ? null : m.n)}>{md === m.n ? 'Chiudi' : 'Dettaglio'}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          {md != null && <div style={{ marginTop: 12 }}><MatchdayDetail number={md} /></div>}
        </div>
      )}

      {view === 'inj' && <div className="card pad"><h4 style={{ marginTop: 0 }}>Infortuni: CBS vs Dunkest</h4><Injuries /></div>}

      {view === 'how' && (
        <div className="card pad small">
          <h4 style={{ marginTop: 0 }}>Come funziona il motore</h4>
          <ol>
            <li><b>Statistiche:</b> ogni giorno legge i box score ufficiali NBA (cdn.nba.com) delle partite di 2 giorni prima, già consolidate. Salva tutte le voci di ogni giocatore, partita per partita.</li>
            <li><b>PDK:</b> formula ufficiale Dunkest (punti +1, rimb. dif. +1, rimb. off. +1,25, assist/rubate/stoppate +1,5, perse −1,5, stoppate subite −0,5, tiri e liberi sbagliati −1, titolare +1, triple 3/4/5+, doppia/tripla/quadrupla doppia +5/+10/+50, vittoria +5%). Sugli stessi numeri dà il 100% dei PDK Dunkest.</li>
            <li><b>Medie e totali:</b> calcolati come Dunkest (minuti totali arrotondati per partita, medie dai secondi, percentuali sui totali, 1 decimale).</li>
            <li><b>Crediti:</b> a fine giornata (PDK della prima partita − 1,95 × crediti) / 80, arrotondato a 0,1; −0,1 a chi non gioca; minimo 4,0. I crediti MCC partono da quelli Dunkest della G{meta.startMd} e poi evolvono da soli.</li>
            <li><b>Infortuni:</b> CBS Sports, fotografato ogni giorno. Dunkest non congela gli infortunati, quindi non tocca i crediti.</li>
            <li><b>Confronto:</b> finché giriamo in parallelo, ogni valore viene confrontato con Dunkest (tabella stats, giornate e match log pubblici).</li>
          </ol>
          <p className="muted">Limite noto: Dunkest usa i dati OPTA, noi quelli NBA. Su qualche giocatore OPTA conta un fallo subito, una stoppata o una rubata in più o in meno (le differenze più frequenti riguardano i falli subiti, che non entrano nel PDK). Con fonti gratuite questo scarto residuo non è eliminabile.</p>
          <p className="muted">Giocatori seguiti: {meta.players} · nuovi non presenti in Dunkest: {meta.newPlayers} · in attesa di abbinamento: {meta.pending}.</p>
        </div>
      )}
    </div>
  );
}
