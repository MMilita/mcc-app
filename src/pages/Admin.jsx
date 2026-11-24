// Dashboard del Commissioner: utenti e accessi, landing/config, classifica, franchigie e contratti, formazioni, sync.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData, fmt, packRows } from '../lib/data';
import { capSummary, cutCharge, isRookieScale, keyOf, SEASON_KEY } from '../lib/cap';
import { RoleTag, Spinner } from '../components/ui';
import { useRules } from './Rules';
import TokenAlert from '../components/TokenAlert';
import MccEngine from '../components/MccEngine';
import { buildSeasons, seasonLabel, useHistoryDoc } from './History';
import Tournaments, { useTournamentsConfig } from '../components/Tournaments';
import { useH2H } from '../lib/h2h';
import { istDraw, istGroupMds, istPots, parseMds, standingsAt } from '../lib/tournaments';

const TABS = [['users', 'Utenti'], ['site', 'Landing & giornata'], ['standings', 'Classifica'], ['rosters', 'Rose & contratti'], ['records', 'Albo & record'], ['rules', 'Regolamento'], ['tournaments', 'Tornei'], ['history', 'Storico'], ['lineups', 'Formazioni'], ['sync', 'Dati Dunkest'], ['mcc', 'Motore MCC']];
const NEXT = ['2027/2028', '2028/2029'];
const up1 = (x) => Math.ceil(x * 10 - 1e-9) / 10; // arrotondamento per eccesso (Regolamento par. 3)

function useCol(name) {
  const [rows, setRows] = useState([]);
  useEffect(() => onSnapshot(collection(db, name), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), [name]);
  return rows;
}

function Saved({ when }) { return when ? <span className="pill ok">Salvato {when}</span> : null; }

export default function Admin() {
  const data = useData();
  const { franchises, franchiseById, config, standings, players, playersMeta, owners } = data;
  const [tab, setTab] = useState('users');
  const [msg, setMsg] = useState(null);
  const ok = (m = 'Salvato ✓') => { setMsg(typeof m === 'string' ? `${m} ✓` : 'Salvato ✓'); setTimeout(() => setMsg(null), 2500); };
  const fail = (e) => setMsg(`Errore: ${e.code || e.message}`);
  const users = useCol('users');
  const lineups = useCol('lineups');

  return (
    <div className="grid">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <div><div className="kicker">Area riservata</div><h2>Dashboard Commissioner</h2></div>
        {msg && <span className="pill warn">{msg}</span>}
      </div>
      <TokenAlert />
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'users' && <Users users={users} franchises={franchises} ok={ok} fail={fail} />}
      {tab === 'site' && <Site config={config} ok={ok} fail={fail} />}
      {tab === 'standings' && <Standings standings={standings} ok={ok} fail={fail} />}
      {tab === 'rules' && <RulesEditor ok={ok} fail={fail} />}
      {tab === 'tournaments' && <TournamentsAdmin ok={ok} fail={fail} />}
      {tab === 'history' && <HistoryAdmin ok={ok} fail={fail} />}
      {tab === 'records' && <Records records={data.records} ok={ok} fail={fail} />}
      {tab === 'rosters' && <Rosters franchises={franchises} franchiseById={franchiseById} players={players} owners={owners} ok={ok} fail={fail} />}
      {tab === 'lineups' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Franchigia</th><th>Giornata</th><th>Capitano</th><th>Ultimo salvataggio</th></tr></thead>
            <tbody>{franchises.map((f) => {
              const l = lineups.find((x) => x.id === f.id);
              const current = l && l.matchday === config.matchday;
              return <tr key={f.id}><td><a href={`/app/formazione/${f.id}`}>{f.name}</a></td><td>{l ? <span className={`pill ${current ? 'ok' : 'warn'}`}>G{l.matchday ?? '?'}</span> : <span className="pill bad">Mai salvata</span>}</td><td>{l?.captain || '–'}</td><td className="small muted">{l?.updatedAt?.toDate?.().toLocaleString('it-IT')} {l?.updatedBy}</td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {tab === 'mcc' && <MccEngine />}
      {tab === 'sync' && (
        <div className="card pad">
          <h3>Sincronizzazione Dunkest</h3>
          <p>Ultimo aggiornamento: <b>{playersMeta?.updatedAt?.toDate?.().toLocaleString('it-IT') || 'mai'}</b> · {playersMeta?.count || 0} giocatori.</p>
          <p className="small muted">Fonte: API pubblica statistiche Dunkest (crediti, PDK, medie). Aggiornamento automatico con GitHub Actions due volte al giorno (08:30 e 14:30 ora italiana), dopo i calcoli notturni di Dunkest. Costo: 0 (piano Firebase Spark + minuti GitHub Actions gratuiti).</p>
          <p className="small muted">Per forzare un aggiornamento: GitHub → repository mcc-app → Actions → "Sync Dunkest" → Run workflow.</p>
        </div>
      )}
    </div>
  );
}

function Users({ users, franchises, ok, fail }) {
  const { config } = useData();
  const [admins, setAdmins] = useState([]);
  useEffect(() => onSnapshot(doc(db, 'config', 'admins'), (s) => setAdmins(s.data()?.emails || [])), []);
  const toggleAdmin = (email) => setDoc(doc(db, 'config', 'admins'), { emails: admins.includes(email) ? admins.filter((e) => e !== email) : [...admins, email] }).then(() => ok(), fail);
  const suggest = (u) => franchises.find((f) => f.gm && u.name && f.gm.toLowerCase().split(' ').every((w) => u.name.toLowerCase().includes(w)))?.id;
  return (
    <div className="card table-wrap">
      <div className="pad" style={{ paddingBottom: 0 }}>
        <h3>Utenti e accessi</h3>
        <p className="small muted">Ogni GM accede con Google; qui colleghi il suo account alla franchigia (può modificare solo la propria formazione). Condividi il link dell'app nel gruppo: {window.location.origin}/app</p>
      </div>
      <table>
        <thead><tr><th>Utente</th><th>Franchigia</th><th>Commissioner</th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id}>
            <td><b>{u.name}</b><div className="small muted">{u.email}</div></td>
            <td>
              <select value={u.franchiseId || ''} onChange={(e) => updateDoc(doc(db, 'users', u.id), { franchiseId: e.target.value || null }).then(() => ok(), fail)}>
                <option value="">— nessuna —</option>
                {franchises.map((f) => <option key={f.id} value={f.id}>{f.name}{suggest(u) === f.id ? ' ★' : ''}</option>)}
              </select>
            </td>
            <td><label className="switch"><input type="checkbox" checked={admins.includes(u.email)} onChange={() => toggleAdmin(u.email)} /> admin</label></td>
          </tr>
        ))}</tbody>
      </table>
      {!users.length && <p className="pad muted">Nessun utente ha ancora fatto accesso.</p>}
      <p className="pad small muted" style={{ margin: 0 }}>★ = franchigia suggerita in base al nome del GM. Stagione {config.season}.</p>
      <PreAssign franchises={franchises} ok={ok} fail={fail} />
    </div>
  );
}

function PreAssign({ franchises, ok, fail }) {
  const [map, setMap] = useState({});
  const [email, setEmail] = useState('');
  const [fid, setFid] = useState('');
  useEffect(() => onSnapshot(doc(db, 'config', 'gmEmails'), (s) => setMap(s.data()?.map || {}), () => setMap({})), []);
  // elenco completo (solo admin) + un invito per email, leggibile solo dal diretto interessato
  const save = (next) => Promise.all([
    setDoc(doc(db, 'config', 'gmEmails'), { map: next }),
    ...Object.entries(next).map(([e, f]) => setDoc(doc(db, 'invites', e), { franchiseId: f })),
    ...Object.keys(map).filter((e) => !(e in next)).map((e) => deleteDoc(doc(db, 'invites', e))),
  ]).then(() => ok(), fail);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  return (
    <div className="pad" style={{ borderTop: '1px solid var(--line)' }}>
      <h3>Email dei GM (assegnazione automatica)</h3>
      <p className="small muted">Chi accede la prima volta con una di queste email Google si ritrova già collegato alla sua franchigia.</p>
      <table><tbody>{Object.entries(map).map(([e, f]) => (
        <tr key={e}><td className="small">{e}</td><td className="small">{franchises.find((x) => x.id === f)?.name || f}</td>
          <td><button className="btn sm ghost" onClick={() => { const n = { ...map }; delete n[e]; save(n); }}>Rimuovi</button></td></tr>
      ))}</tbody></table>
      <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
        <input id="pre-email" type="email" placeholder="email@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: '1 1 200px', width: 'auto' }} />
        <select id="pre-fid" value={fid} onChange={(e) => setFid(e.target.value)} style={{ flex: '1 1 200px', width: 'auto' }}>
          <option value="">Franchigia…</option>{franchises.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="btn sm" disabled={!valid || !fid} onClick={() => save({ ...map, [email.trim().toLowerCase()]: fid }).then(() => { setEmail(''); setFid(''); })}>Aggiungi</button>
      </div>
    </div>
  );
}

function Site({ config, ok, fail }) {
  const [c, setC] = useState(config);
  const [ann, setAnn] = useState('');
  useEffect(() => setC(config), [config]);
  const save = (patch) => setDoc(doc(db, 'config', 'app'), patch, { merge: true }).then(() => ok(), fail);
  const dl = c.lineupDeadline ? new Date(c.lineupDeadline) : null;
  const local = dl ? new Date(dl.getTime() - dl.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return (
    <div className="grid admin-grid">
      <div className="card pad">
        <h3>Landing pubblica</h3>
        <div className="field" style={{ marginTop: 12 }}><label>Titolo</label><input value={c.heroTitle || ''} onChange={(e) => setC({ ...c, heroTitle: e.target.value })} /></div>
        <div className="field"><label>Sottotitolo</label><textarea rows="3" value={c.heroSubtitle || ''} onChange={(e) => setC({ ...c, heroSubtitle: e.target.value })} /></div>
        <div className="field"><label>Stagione</label><input value={c.season || ''} onChange={(e) => setC({ ...c, season: e.target.value })} /></div>
        <label className="switch" style={{ marginBottom: 12 }}><input type="checkbox" checked={c.showGM !== false} onChange={(e) => setC({ ...c, showGM: e.target.checked })} /> Mostra i nomi dei GM nella landing</label>
        <button className="btn" onClick={() => save({ heroTitle: c.heroTitle, heroSubtitle: c.heroSubtitle, season: c.season, showGM: c.showGM !== false })}>Salva landing</button>
      </div>
      <div className="card pad">
        <h3>Giornata e formazioni</h3>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field" style={{ flex: 1 }}><label>Giornata</label><input type="number" value={c.matchday || ''} onChange={(e) => setC({ ...c, matchday: +e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label>Turno</label><input value={c.round || ''} onChange={(e) => setC({ ...c, round: e.target.value })} /></div>
        </div>
        <div className="field"><label>Scadenza sostituzioni</label><input type="datetime-local" value={local} onChange={(e) => setC({ ...c, lineupDeadline: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
        <button className="btn" onClick={() => save({ matchday: c.matchday, round: c.round, lineupDeadline: c.lineupDeadline || null })}>Salva giornata</button>
      </div>
      <div className="card pad">
        <h3>Novità dell'app</h3>
        <p className="small muted">Compaiono in Home a ogni GM come riquadro chiudibile, una volta per aggiornamento.</p>
        <UpdateForm config={config} save={save} />
      </div>
      <div className="card pad">
        <h3>Comunicati</h3>
        {(config.announcements || []).map((a, i) => (
          <div key={i} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="small"><b>{a.date}</b> {a.text}</span>
            <button className="btn sm ghost" onClick={() => save({ announcements: config.announcements.filter((_, j) => j !== i) })}>Rimuovi</button>
          </div>
        ))}
        <div className="field" style={{ marginTop: 12 }}><label>Nuovo comunicato</label><textarea rows="2" value={ann} onChange={(e) => setAnn(e.target.value)} /></div>
        <button className="btn" disabled={!ann.trim()} onClick={() => save({ announcements: [{ date: new Date().toISOString().slice(0, 10), text: ann.trim() }, ...(config.announcements || [])] }).then(() => setAnn(''))}>Pubblica</button>
      </div>
    </div>
  );
}

function Standings({ standings, ok, fail }) {
  const [s, setS] = useState(standings);
  useEffect(() => setS(standings), [standings]);
  if (!s) return null;
  const setRow = (i, k, v) => setS({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const sorted = () => ({ ...s, rows: s.rows.slice().sort((a, b) => b.w - a.w || b.fpt - a.fpt) });
  const setMatch = (i, k, v) => setS({ ...s, liveMatchday: s.liveMatchday.map((m, j) => (j === i ? { ...m, [k]: v } : m)) });
  return (
    <div className="grid admin-grid">
      <div className="card table-wrap">
        <div className="pad row between" style={{ paddingBottom: 0 }}>
          <h3>Classifica</h3>
          <div className="row"><label className="small muted">Giornata</label><input type="number" value={s.matchday} onChange={(e) => setS({ ...s, matchday: +e.target.value })} style={{ width: 80 }} /></div>
        </div>
        <table>
          <thead><tr><th>Franchigia</th><th>W</th><th>L</th><th>FPT</th></tr></thead>
          <tbody>{s.rows.map((r, i) => (
            <tr key={r.team}><td className="small" style={{ fontWeight: 600 }}>{r.team}</td>
              <td><input type="number" value={r.w} onChange={(e) => setRow(i, 'w', +e.target.value)} style={{ width: 60 }} /></td>
              <td><input type="number" value={r.l} onChange={(e) => setRow(i, 'l', +e.target.value)} style={{ width: 60 }} /></td>
              <td><input type="number" step="0.01" value={r.fpt} onChange={(e) => setRow(i, 'fpt', +e.target.value)} style={{ width: 100 }} /></td></tr>
          ))}</tbody>
        </table>
        <div className="pad row"><button className="btn" onClick={() => setDoc(doc(db, 'league', 'standings'), sorted()).then(() => ok(), fail)}>Salva e riordina</button></div>
      </div>
      <div className="card table-wrap">
        <div className="pad" style={{ paddingBottom: 0 }}><h3>Partite della giornata</h3></div>
        <table><tbody>{(s.liveMatchday || []).map((m, i) => (
          <tr key={i}>
            <td className="small">{m.home}<input type="number" step="0.01" value={m.hs} onChange={(e) => setMatch(i, 'hs', +e.target.value)} /></td>
            <td className="small">{m.away}<input type="number" step="0.01" value={m.as} onChange={(e) => setMatch(i, 'as', +e.target.value)} /></td>
          </tr>
        ))}</tbody></table>
        <div className="pad"><button className="btn" onClick={() => setDoc(doc(db, 'league', 'standings'), s).then(() => ok(), fail)}>Salva risultati</button></div>
      </div>
    </div>
  );
}

function Rosters({ franchises, franchiseById, players, owners, ok, fail }) {
  const [selFid, setFid] = useState(null);
  const fid = selFid || franchises[0]?.id; // le franchigie possono arrivare dopo il primo render
  const f = franchiseById[fid];
  const [add, setAdd] = useState({ name: '', years: 1, salary: '' });
  const [pending, setPending] = useState(null); // { kind, name } azione da confermare
  const free = useMemo(() => players.filter((p) => !owners[keyOf(p.name)]).sort((a, b) => a.name.localeCompare(b.name)), [players, owners]);
  if (!f) return <Spinner />;
  const write = (patch, msg) => updateDoc(doc(db, 'franchises', f.id), patch).then(() => ok(msg), fail);
  const c = capSummary(f);
  const today = () => new Date().toISOString().slice(0, 10);
  const without = (list, name) => (list || []).filter((x) => x.name !== name);

  // azioni sul giocatore (Regolamento: taglio 50% sul cap; Injury List recupera il 90% della stagione in corso)
  const ACTIONS = {
    cut: { label: 'Taglia', confirm: (p) => `Tagliare ${p.name}? Peserà il 50% sul cap per ${isRookieScale(p) && Object.keys(p.salaries || {}).sort().indexOf(SEASON_KEY) < 2 ? 'i due anni garantiti della Rookie Scale (le Team Option del 3°-4° anno pesano 0)' : 'tutta la durata del contratto'} (taglio ${(f.cut || []).length + 1} di 4).`,
      run: (p) => write({ roster: without(f.roster, p.name), cut: [...(f.cut || []), { ...p, cutAt: today() }] }, `${p.name} tagliato`) },
    il: { label: 'Injury List', confirm: (p) => `Mettere ${p.name} in Injury List? Libera lo slot e recupera il 90% dello stipendio ${SEASON_KEY}; non sarà utilizzabile fino alla prossima stagione.`,
      run: (p) => write({ roster: without(f.roster, p.name), injured: [...(f.injured || []), { ...p, orig: p.salaries, salaries: { ...p.salaries, [SEASON_KEY]: Math.round((p.salaries?.[SEASON_KEY] || 0) * 0.1 * 10) / 10 }, ilAt: today() }] }, `${p.name} in Injury List`) },
    del: { label: 'Elimina', confirm: (p) => `Eliminare ${p.name} dalla rosa come inserimento sbagliato? Sparisce del tutto (nessun peso sul cap). Per un vero taglio usa "Taglia".`,
      run: (p) => write({ roster: without(f.roster, p.name) }, `${p.name} eliminato`) },
  };
  // fotografa il monte stipendi attuale di tutte le franchigie come "fine FantaDraft" della stagione
  const snapshotAll = () => Promise.all(franchises.map((x) => updateDoc(doc(db, 'franchises', x.id), { draftTotals: { ...(x.draftTotals || {}), [SEASON_KEY]: capSummary({ ...x, draftTotals: {} }).total } })))
    .then(() => ok('Totali di fine Draft registrati'), fail);
  const restoreCut = (p) => { const { cutAt, ...rest } = p; write({ cut: without(f.cut, p.name), roster: [...f.roster, rest] }, `${p.name} ripristinato`); };
  const restoreIl = (p) => { const { ilAt, orig, ...rest } = p; write({ injured: without(f.injured, p.name), roster: [...f.roster, { ...rest, salaries: orig || rest.salaries }] }, `${p.name} tolto dalla Injury List`); };
  const removeOther = (key, p) => write({ [key]: without(f[key], p.name) }, `${p.name} rimosso`);
  const setSalary = (p, v) => write({ roster: f.roster.map((x) => (x.name === p.name ? { ...x, salaries: { ...x.salaries, [SEASON_KEY]: +v } } : x)) });
  const setRole = (p, v) => write({ roster: f.roster.map((x) => (x.name === p.name ? { ...x, role: v } : x)) });
  const sign = () => {
    const dk = players.find((p) => p.name === add.name);
    if (!dk) return;
    const base = +add.salary || dk.cr;
    const salaries = { [SEASON_KEY]: up1(base) };
    if (add.years >= 2) salaries[NEXT[0]] = up1(base * 1.5);
    if (add.years >= 3) salaries[NEXT[1]] = up1(base * 2);
    write({ roster: [...f.roster, { name: dk.name, team: dk.team, role: dk.pos, salaries, signedAt: today() }] }, `${dk.name} firmato`).then(() => setAdd({ name: '', years: 1, salary: '' }));
  };
  const dkSel = players.find((p) => p.name === add.name);
  const yrs = (p) => Object.entries(p.salaries || {}).filter(([k]) => k > SEASON_KEY).map(([k, v]) => `${k.slice(2, 4)}/${k.slice(7)}: ${v}`).join(' · ');

  return (
    <div className="grid">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select aria-label="Franchigia" value={fid} onChange={(e) => { setFid(e.target.value); setPending(null); }} style={{ width: 'auto' }}>{franchises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <span className={`pill ${c.status === 'ok' ? 'ok' : c.status === 'apron' ? 'bad' : 'warn'}`}>Totale {fmt(c.total)} · spazio {fmt(c.space)}</span>
        <span className="pill">{c.players} a roster · {(f.cut || []).length}/4 tagli · {(f.injured || []).length} in IL</span>
      </div>
      <div className="card pad row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <label className="small" htmlFor="draft-total" style={{ fontWeight: 700 }}>Monte stipendi a fine FantaDraft {SEASON_KEY}</label>
        <input id="draft-total" type="number" step="0.1" defaultValue={f.draftTotals?.[SEASON_KEY] ?? ''} key={`dt-${f.id}`} style={{ width: 110 }}
          onBlur={(e) => { const val = e.target.value === '' ? null : +e.target.value; if (val !== (f.draftTotals?.[SEASON_KEY] ?? null)) write({ draftTotals: { ...(f.draftTotals || {}), [SEASON_KEY]: val } }, 'Totale fine Draft salvato'); }} />
        <span className="small muted">Se supera 120 diventa il minimo conteggiato a fine stagione (art. 3.1). {c.draftFloor != null ? `Attuale ${fmt(c.total)}, a fine stagione conta ${fmt(c.counted)}.` : ''}</span>
        <button className="btn sm ghost" onClick={snapshotAll}>Registra fine Draft per tutte le franchigie</button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Ruolo</th><th>Giocatore</th><th>Stip. 26/27</th><th className="hide-sm">Anni successivi</th><th>Azioni</th></tr></thead>
          <tbody>{(f.roster || []).map((p) => (
            <Fragment key={p.name}>
              <tr>
                <td><select aria-label={`Ruolo ${p.name}`} value={p.role} onChange={(e) => setRole(p, e.target.value)} style={{ width: 62, padding: '6px' }}>{['G', 'A', 'C'].map((r) => <option key={r}>{r}</option>)}</select></td>
                <td><b>{p.name}</b> <span className="small muted">{p.team}</span></td>
                <td><input aria-label={`Stipendio ${p.name}`} type="number" step="0.1" defaultValue={p.salaries?.[SEASON_KEY] ?? ''} onBlur={(e) => e.target.value !== String(p.salaries?.[SEASON_KEY] ?? '') && setSalary(p, e.target.value)} style={{ width: 84 }} /></td>
                <td className="small muted hide-sm">{yrs(p)}</td>
                <td><div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  {Object.entries(ACTIONS).map(([k, a]) => <button key={k} className={`btn sm ${k === 'del' ? 'ghost danger' : 'ghost'}`} onClick={() => setPending({ kind: k, name: p.name })}>{a.label}</button>)}
                </div></td>
              </tr>
              {pending?.name === p.name && (
                <tr className="confirm-row"><td colSpan={5}>
                  <div className="row between" style={{ flexWrap: 'wrap' }}>
                    <span className="small">{ACTIONS[pending.kind].confirm(p)}</span>
                    <span className="row" style={{ gap: 6 }}>
                      <button className="btn sm ghost" onClick={() => setPending(null)}>Annulla</button>
                      <button className={`btn sm ${pending.kind === 'del' ? 'red' : ''}`} onClick={() => { ACTIONS[pending.kind].run(p); setPending(null); }}>Conferma: {ACTIONS[pending.kind].label}</button>
                    </span>
                  </div>
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table>
      </div>

      {((f.cut || []).length > 0 || (f.injured || []).length > 0) && (
        <div className="card table-wrap">
          <div className="pad" style={{ paddingBottom: 0 }}><h3>Tagliati e Injury List</h3></div>
          <table><tbody>
            {(f.cut || []).map((p) => (
              <tr key={`c-${p.name}`}><td><span className="pill bad">Tagliato</span></td><td><b>{p.name}</b><div className="small muted">{p.cutAt ? `dal ${p.cutAt} · ` : ''}pesa {fmt(cutCharge(p))} sul cap</div></td>
                <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => restoreCut(p)}>Ripristina</button><button className="btn sm ghost danger" onClick={() => removeOther('cut', p)}>Elimina</button></td></tr>
            ))}
            {(f.injured || []).map((p) => (
              <tr key={`i-${p.name}`}><td><span className="pill warn">Injury List</span></td><td><b>{p.name}</b><div className="small muted">{p.ilAt ? `dal ${p.ilAt} · ` : ''}pesa {fmt(p.salaries?.[SEASON_KEY] || 0)} sul cap (10%)</div></td>
                <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => restoreIl(p)}>Ripristina</button><button className="btn sm ghost danger" onClick={() => removeOther('injured', p)}>Elimina</button></td></tr>
            ))}
          </tbody></table>
        </div>
      )}

      <div className="card pad">
        <h3>Firma free agent (asta chiusa)</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
          <div className="field"><label htmlFor="fa-name">Giocatore</label>
            <input id="fa-name" list="fa-list" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="Cerca tra i liberi" />
            <datalist id="fa-list">{free.map((p) => <option key={p.id} value={p.name}>{p.team} {p.pos} · {p.cr}</option>)}</datalist>
          </div>
          <div className="field"><label htmlFor="fa-price">Prezzo d'asta</label><input id="fa-price" type="number" step="0.1" value={add.salary} placeholder={dkSel ? `min ${dkSel.cr}` : ''} onChange={(e) => setAdd({ ...add, salary: e.target.value })} /></div>
          <div className="field"><label htmlFor="fa-years">Durata</label><select id="fa-years" value={add.years} onChange={(e) => setAdd({ ...add, years: +e.target.value })}><option value={1}>1 anno</option><option value={2}>2 anni (+50%)</option><option value={3}>3 anni (+100%)</option></select></div>
        </div>
        {dkSel && +add.salary > 0 && +add.salary < dkSel.cr && <p className="small" style={{ color: 'var(--cross)' }}>Offerta sotto il valore Dunkest attuale ({dkSel.cr}): non ammessa dal regolamento.</p>}
        <button className="btn" disabled={!dkSel || (+add.salary > 0 && +add.salary < dkSel.cr)} onClick={sign}>Aggiungi a {f.name}</button>
      </div>

      <FranchiseInfo key={f.id} f={f} write={write} />
    </div>
  );
}

// Dati societari, palmarès e premi: una voce per riga
function FranchiseInfo({ f, write }) {
  const AW = ['MVP', 'DPY', 'ROY', '6MY', 'MIP', 'CPY', 'COY'];
  const [v, setV] = useState(() => ({
    gm: f.gm || '', quartiere: f.quartiere || '', zona: f.zona || '', founded: f.founded || '', arena: f.arena || '', colors: f.colors || '',
    names: (f.names || []).join('\n'), palmares: (f.palmares || []).join('\n'),
    ...Object.fromEntries(AW.map((a) => [`aw_${a}`, (f.awards?.[a] || []).join('\n')])),
  }));
  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const save = () => write({
    gm: v.gm, quartiere: v.quartiere, zona: v.zona, founded: v.founded ? +v.founded : null, arena: v.arena, colors: v.colors,
    names: lines(v.names), palmares: lines(v.palmares),
    awards: Object.fromEntries(AW.map((a) => [a, lines(v[`aw_${a}`])]).filter(([, x]) => x.length)),
  }, 'Dati franchigia salvati');
  const F = (k, label, props = {}) => <div className="field"><label htmlFor={`fi-${k}`}>{label}</label><input id={`fi-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...props} /></div>;
  const T = (k, label, hint) => <div className="field"><label htmlFor={`fi-${k}`}>{label}</label><textarea id={`fi-${k}`} rows="3" value={v[k]} placeholder={hint} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>;
  return (
    <div className="card pad">
      <h3>Dati societari, palmarès e premi · {f.name}</h3>
      <p className="small muted">Una voce per riga. Le modifiche compaiono subito su sito e app.</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 14px' }}>
        {F('gm', 'GM')}{F('quartiere', 'Quartiere')}{F('zona', 'Zona')}{F('founded', 'Fondazione', { type: 'number' })}{F('arena', 'Arena')}{F('colors', 'Colori sociali')}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 14px' }}>
        {T('names', 'Denominazioni (storia)', 'Besenzanica Red Lights (2018-2021)')}
        {T('palmares', 'Palmarès', '1 Titolo MCC (2025)')}
        {AW.map((a) => T(`aw_${a}`, `Premi ${a}`, 'Nikola Jokic (2024)'))}
      </div>
      <button className="btn" onClick={save}>Salva dati franchigia</button>
    </div>
  );
}

// Albo d'oro e record all time modificabili
function Records({ records, ok, fail }) {
  const [r, setR] = useState(records);
  useEffect(() => setR(records), [records]);
  if (!r) return <Spinner />;
  // righe ordinate per anno (albo d'oro) e salvate nel formato accettato da Firestore
  const save = () => setDoc(doc(db, 'league', 'records'), packRows({ ...r, champions: (r.champions || []).filter((x) => x[0] || x[1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) })).then(() => ok('Record salvati'), fail);
  const setCell = (key, i, j, val) => setR({ ...r, [key]: r[key].map((row, a) => (a === i ? row.map((c, b) => (b === j ? (typeof c === 'number' && val !== '' && !Number.isNaN(+val) ? +val : val) : c)) : row)) });
  const addRow = (key, width) => setR({ ...r, [key]: [...(r[key] || []), Array(width).fill('')] });
  const delRow = (key, i) => setR({ ...r, [key]: r[key].filter((_, a) => a !== i) });
  const setRec = (sec, i, j, val) => setR({ ...r, teamRecords: { ...r.teamRecords, [sec]: r.teamRecords[sec].map((row, a) => (a === i ? row.map((c, b) => (b === j ? val : c)) : row)) } });
  const addRec = (sec) => setR({ ...r, teamRecords: { ...r.teamRecords, [sec]: [...(r.teamRecords?.[sec] || []), ['', '']] } });
  const delRec = (sec, i) => setR({ ...r, teamRecords: { ...r.teamRecords, [sec]: r.teamRecords[sec].filter((_, a) => a !== i) } });
  const table = ({ k, title, head }) => (
    <div className="card table-wrap">
      <div className="pad row between" style={{ paddingBottom: 0 }}><h3>{title}</h3><button className="btn sm ghost" onClick={() => addRow(k, head.length)}>+ Riga</button></div>
      <table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}<th /></tr></thead>
        <tbody>{(r[k] || []).map((row, i) => (
          <tr key={i}>{row.map((c, j) => <td key={j}><input aria-label={`${title} ${head[j]} riga ${i + 1}`} value={c ?? ''} onChange={(e) => setCell(k, i, j, e.target.value)} style={{ minWidth: j === 0 || (k === 'champions' && j === 1) ? 160 : 64 }} /></td>)}
            <td><button className="btn sm ghost danger" onClick={() => delRow(k, i)} aria-label="Elimina riga">✕</button></td></tr>
        ))}</tbody></table>
    </div>
  );
  return (
    <div className="grid">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <p className="small muted" style={{ margin: 0 }}>Modifica e premi Salva: landing e app si aggiornano subito per tutti.</p>
        <button className="btn" onClick={save}>Salva albo e record</button>
      </div>
      {table({ k: 'champions', title: "Albo d'oro (campioni)", head: ['Anno', 'Squadra'] })}
      {Object.keys(r.teamRecords || {}).map((sec) => (
        <div key={sec} className="card table-wrap">
          <div className="pad row between" style={{ paddingBottom: 0 }}><h3>Record {sec}</h3><button className="btn sm ghost" onClick={() => addRec(sec)}>+ Record</button></div>
          <table><tbody>{r.teamRecords[sec].map(([a, b], i) => (
            <tr key={i}><td><input aria-label={`Record ${sec} ${i + 1}`} value={a} onChange={(e) => setRec(sec, i, 0, e.target.value)} /></td><td><input aria-label={`Valore ${sec} ${i + 1}`} value={b} onChange={(e) => setRec(sec, i, 1, e.target.value)} /></td><td><button className="btn sm ghost danger" onClick={() => delRec(sec, i)} aria-label="Elimina record">✕</button></td></tr>
          ))}</tbody></table>
        </div>
      ))}
      {table({ k: 'regularSeason', title: 'All time Regular Season', head: ['Squadra', 'Stagioni', 'GP', 'Record', 'Pct'] })}
      {table({ k: 'playoff', title: 'All time Playoff', head: ['Squadra', 'Edizioni', 'GP', 'Record', 'Pct'] })}
      {table({ k: 'finals', title: 'All time Finals', head: ['Squadra', 'Edizioni', 'GP', 'Record', 'Pct'] })}
      <button className="btn" onClick={save}>Salva albo e record</button>
    </div>
  );
}

// Regolamento ufficiale: modifica articolo per articolo
function RulesEditor({ ok, fail }) {
  const rules = useRules();
  const [secs, setSecs] = useState(null);
  const [openId, setOpenId] = useState(null);
  useEffect(() => { if (rules && !secs) setSecs(rules.sections || []); }, [rules, secs]);
  if (!secs) return <Spinner />;
  const upd = (i, k, v) => setSecs(secs.map((s, j) => (j === i ? { ...s, [k]: v, ...(k === 'num' ? { id: `art-${v.replace(/\./g, '-')}` } : {}) } : s)));
  const save = () => setDoc(doc(db, 'league', 'rules'), { ...rules, sections: secs, updatedAt: new Date() }).then(() => ok('Regolamento salvato'), fail);
  const addAfter = (i) => { const n = [...secs]; n.splice(i + 1, 0, { num: '', title: 'Nuovo articolo', body: '', id: `art-new-${Date.now()}` }); setSecs(n); setOpenId(n[i + 1].id); };
  return (
    <div className="grid">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <p className="small muted" style={{ margin: 0 }}>Testo ufficiale pubblicato su /regolamento. Paragrafi separati da una riga vuota; elenchi con “• ”; tabelle con righe “| a | b |”.</p>
        <span className="row"><a className="btn sm ghost" href="/regolamento" target="_blank" rel="noreferrer">Anteprima</a><button className="btn" onClick={save}>Salva regolamento</button></span>
      </div>
      {secs.map((s, i) => (
        <div key={s.id} className="card pad">
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={() => setOpenId(openId === s.id ? null : s.id)}><b>{s.num}</b>&nbsp;{s.title}</button>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn sm ghost" onClick={() => addAfter(i)}>+ Articolo dopo</button>
              <button className="btn sm ghost danger" onClick={() => setSecs(secs.filter((_, j) => j !== i))}>Elimina</button>
            </span>
          </div>
          {openId === s.id && (
            <div className="grid" style={{ gap: 8, marginTop: 10 }}>
              <div className="row"><input aria-label="Numero articolo" value={s.num} onChange={(e) => upd(i, 'num', e.target.value)} style={{ width: 80 }} /><input aria-label="Titolo articolo" value={s.title} onChange={(e) => upd(i, 'title', e.target.value)} /></div>
              <textarea aria-label={`Testo articolo ${s.num}`} rows={Math.min(24, Math.max(6, s.body.split('\n').length + 2))} value={s.body} onChange={(e) => upd(i, 'body', e.target.value)} />
            </div>
          )}
        </div>
      ))}
      <button className="btn" onClick={save}>Salva regolamento</button>
    </div>
  );
}

// Configurazione tornei: giornate, sorteggio IST, lunghezza serie
function TournamentsAdmin({ ok, fail }) {
  const cfg = useTournamentsConfig();
  const { matchdays, meta } = useH2H();
  const [v, setV] = useState(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (cfg && !v) setV({
      rsLast: cfg.rs?.lastMd || 30,
      refMd: cfg.ist?.refMd || 15, groupMds: cfg.ist?.groupMds || istGroupMds(cfg.ist || {}).join(', '), qfMd: cfg.ist?.qfMd || 25, sfMd: cfg.ist?.sfMd || 27, fMd: cfg.ist?.fMd || 29,
      md1: cfg.playin?.md1 || 31, md2: cfg.playin?.md2 || 32,
      poBest: cfg.playoff?.bestOf || 3, poQf: cfg.playoff?.qfMds || '33, 34, 35', poSf: cfg.playoff?.sfMds || '36, 37, 38', poF: cfg.playoff?.fMds || '39, 40, 41',
      plBest: cfg.playout?.bestOf || 3, plQf: cfg.playout?.qfMds || '33, 34, 35', plSf: cfg.playout?.sfMds || '36, 37, 38', plF: cfg.playout?.fMds || '39, 40, 41',
    });
  }, [cfg, v]);
  if (!cfg || !v) return <Spinner />;
  const current = meta?.currentMatchday || 1;
  const save = (extra = {}) => setDoc(doc(db, 'league', 'tournaments'), {
    ...cfg,
    rs: { lastMd: +v.rsLast },
    ist: { ...(cfg.ist || {}), refMd: +v.refMd, groupMds: v.groupMds, startMd: parseMds(v.groupMds)[0] || 17, qfMd: +v.qfMd, sfMd: +v.sfMd, fMd: +v.fMd, ...(extra.ist || {}) },
    playin: { md1: +v.md1, md2: +v.md2 },
    playoff: { bestOf: +v.poBest, qfMds: v.poQf, sfMds: v.poSf, fMds: v.poF },
    playout: { bestOf: +v.plBest, qfMds: v.plQf, sfMds: v.plSf, fMds: v.plF },
    updatedAt: new Date(),
  }, { merge: false }).then(() => ok(extra.msg || 'Tornei salvati'), fail);
  const draw = () => {
    const rows = standingsAt(matchdays, Math.min(+v.refMd, current));
    if (rows.length < 16) { fail(new Error('Classifica incompleta: servono 16 squadre')); return; }
    const pots = istPots(rows);
    save({ ist: { pots, groups: istDraw(pots), drawnAt: new Date().toISOString(), drawnFromMd: Math.min(+v.refMd, current) }, msg: 'Sorteggio effettuato' });
  };
  const resetDraw = () => save({ ist: { pots: null, groups: null }, msg: 'Sorteggio annullato' });
  const N = (k, label) => <div className="field"><label htmlFor={`t-${k}`}>{label}</label><input id={`t-${k}`} type="number" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>;
  const L = (k, label) => <div className="field"><label htmlFor={`t-${k}`}>{label}</label><input id={`t-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="33, 34, 35" /></div>;
  const B = (k, label) => <div className="field"><label htmlFor={`t-${k}`}>{label}</label><select id={`t-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: +e.target.value })}><option value={3}>Al meglio di 3</option><option value={5}>Al meglio di 5</option></select></div>;
  return (
    <div className="grid">
      <p className="small muted" style={{ margin: 0 }}>Le partite di torneo confrontano i punti Dunkest delle due squadre nella giornata indicata (numero di giornata Dunkest; ora siamo alla G{current}). Playoff/Playout: +15 alla squadra in casa.</p>
      <div className="grid admin-grid">
        <div className="card pad">
          <h3>Regular Season</h3>
          {N('rsLast', 'Ultima giornata di Regular Season')}
        </div>
        <div className="card pad">
          <h3>In-Season Tournament</h3>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            {N('refMd', 'Fasce dalla classifica dopo la G')}{L('groupMds', 'Giornate dei gironi (6, separate da virgola)')}
            {N('qfMd', 'Quarti (giornata)')}{N('sfMd', 'Semifinali (giornata)')}{N('fMd', 'Finale (giornata)')}
          </div>
          {cfg.ist?.groups ? (
            <p className="small">Sorteggio fatto il {String(cfg.ist.drawnAt || '').slice(0, 10)} (fasce dalla G{cfg.ist.drawnFromMd}). <button className="btn sm ghost danger" onClick={resetDraw}>Annulla sorteggio</button></p>
          ) : <button className="btn sm" onClick={draw}>Calcola fasce e sorteggia i gironi</button>}
        </div>
        <div className="card pad">
          <h3>Play-In</h3>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>{N('md1', 'Giornata 1 (7-8 e 9-10)')}{N('md2', 'Giornata 2 (spareggio)')}</div>
        </div>
        <div className="card pad">
          <h3>Playoff</h3>
          {B('poBest', 'Lunghezza serie')}{L('poQf', 'Quarti: giornate (gara 1, 2, 3…)')}{L('poSf', 'Semifinali: giornate')}{L('poF', 'Finale: giornate')}
        </div>
        <div className="card pad">
          <h3>Playout</h3>
          {B('plBest', 'Lunghezza serie')}{L('plQf', 'Primo turno: giornate')}{L('plSf', 'Semifinali: giornate')}{L('plF', 'Finale: giornate')}
        </div>
      </div>
      <div className="row"><button className="btn" onClick={() => save()}>Salva configurazione tornei</button><button className="btn ghost" onClick={() => setPreview((x) => !x)}>{preview ? 'Nascondi anteprima' : 'Anteprima tornei'}</button></div>
      {preview && <Tournaments />}
    </div>
  );
}

function UpdateForm({ config, save }) {
  const [title, setTitle] = useState('');
  const [items, setItems] = useState('');
  const list = config.updates || [];
  const publish = () => {
    const today = new Date().toISOString().slice(0, 10);
    const u = { id: `${today}-${Date.now()}`, date: new Date().toLocaleDateString('it-IT'), title: title.trim(), items: items.split('\n').map((x) => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean) };
    save({ updates: [u, ...list].slice(0, 20) }).then(() => { setTitle(''); setItems(''); });
  };
  return (
    <>
      {list.slice(0, 3).map((u) => <div key={u.id} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><b>{u.date}</b> {u.title} <span className="muted">({u.items.length} punti)</span></div>)}
      <div className="field" style={{ marginTop: 10 }}><label htmlFor="up-title">Titolo</label><input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nuova sezione Tornei" /></div>
      <div className="field"><label htmlFor="up-items">Cosa cambia (una riga per punto)</label><textarea id="up-items" rows="4" value={items} onChange={(e) => setItems(e.target.value)} /></div>
      <button className="btn" disabled={!title.trim() || !items.trim()} onClick={publish}>Pubblica novità</button>
    </>
  );
}

// Storico: note e file (link al Drive) per ogni stagione; i vincitori arrivano dai palmarès
function HistoryAdmin({ ok, fail }) {
  const { franchises, records } = useData();
  const stored = useHistoryDoc();
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  if (stored === undefined) return <Spinner />;
  const seasons = buildSeasons(franchises, records, stored);
  const year = sel || seasons[0]?.year;
  const s = seasons.find((x) => x.year === year) || { year };
  const cur = form?.year === year ? form : { year, notes: s.notes || '', links: s.links || [], champion: stored.seasons?.[year]?.champion || '' };
  const set = (patch) => setForm({ ...cur, ...patch });
  const save = () => setDoc(doc(db, 'league', 'history'), { seasons: { ...(stored.seasons || {}), [year]: { notes: cur.notes, links: cur.links.filter((l) => l.url), ...(cur.champion ? { champion: cur.champion } : {}) } } }, { merge: true }).then(() => ok(`Stagione ${seasonLabel(year)} salvata`), fail);
  return (
    <div className="grid">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select aria-label="Stagione" value={year} onChange={(e) => { setSel(e.target.value); setForm(null); }} style={{ width: 'auto' }}>{seasons.map((x) => <option key={x.year} value={x.year}>{seasonLabel(x.year)}</option>)}</select>
        <a className="btn sm ghost" href={`/storico#stagione-${year}`} target="_blank" rel="noreferrer">Anteprima</a>
      </div>
      <div className="card pad">
        <p className="small muted">Campione, Regular Season, In-Season, Playout e premi arrivano dai palmarès delle franchigie (Rose & contratti → Dati societari). Qui aggiungi note e i file della stagione, per esempio i link ai file del Drive.</p>
        <div className="field"><label htmlFor="hs-champ">Campione (solo se manca o va corretto)</label><input id="hs-champ" value={cur.champion} placeholder={s.champion || ''} onChange={(e) => set({ champion: e.target.value })} /></div>
        <div className="field"><label htmlFor="hs-notes">Note della stagione</label><textarea id="hs-notes" rows="4" value={cur.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Finale 3-2, record di punti in gara 4..." /></div>
        <h3 style={{ marginTop: 6 }}>File della stagione</h3>
        {cur.links.map((l, i) => (
          <div key={i} className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <input aria-label={`Nome file ${i + 1}`} value={l.label} placeholder="Roster 2024/25" onChange={(e) => set({ links: cur.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={{ flex: '1 1 160px', width: 'auto' }} />
            <input aria-label={`Link file ${i + 1}`} value={l.url} placeholder="https://drive.google.com/..." onChange={(e) => set({ links: cur.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} style={{ flex: '2 1 240px', width: 'auto' }} />
            <button className="btn sm ghost danger" onClick={() => set({ links: cur.links.filter((_, j) => j !== i) })} aria-label="Rimuovi file">✕</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm ghost" onClick={() => set({ links: [...cur.links, { label: '', url: '' }] })}>+ Aggiungi file</button>
          <button className="btn" onClick={save}>Salva stagione</button>
        </div>
      </div>
    </div>
  );
}
