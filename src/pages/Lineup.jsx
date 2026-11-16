// Schermata Formazione: stesse funzioni e stessa logica della formazione Dunkest (lega Draft),
// con grafica e colori MCC.
//  - Giornata (G) divisa in Turni (T1, T2, …): un giocatore si blocca quando inizia la partita della sua squadra
//  - Sostituzioni aperte tra un turno e l'altro (countdown al prossimo turno), non automatiche
//  - Quintetto 100% (moduli 2-2-1, 1-2-2, 1-3-1, 2-1-2, 3-1-1), 6° uomo 100%, panchina 50%, tribuna 0%
//  - Capitano ×1,5; chi entra deve ancora giocare; chi ha già giocato può solo scendere (es. titolare → panchina)
//  - Drag & drop (tieni premuto su touch, trascina col mouse) oppure tocco → Capitano / Sostituisci / Tribuna
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData, fmt } from '../lib/data';
import { keyOf, salaryOf } from '../lib/cap';
import { CAPTAIN_MULT, SLOT_WEIGHT, countdown, fmtDay, fmtTime, hasStarted, matchFor, matchdayState } from '../lib/timing';
import { FranchiseLogo, Icon, Jersey, RoleTag, Sheet, Spinner } from '../components/ui';
import PlayerDetail from '../components/PlayerDetail';

const FORMATIONS = [[2, 2, 1], [1, 2, 2], [1, 3, 1], [2, 1, 2], [3, 1, 1]];
const MAX = { G: 3, A: 3, C: 2 };
const ROLE_LABEL = { G: 'GUARDIA', A: 'ALA', C: 'CENTRO' };
const empty = () => ({ starters: [null, null, null, null, null], sixth: null, bench: [null, null, null, null], tribuna: [], captain: null });

function counts(names, roleOf) {
  const c = { G: 0, A: 0, C: 0 };
  names.filter(Boolean).forEach((n) => { c[roleOf(n)] = (c[roleOf(n)] || 0) + 1; });
  return c;
}
const validFull = (c) => FORMATIONS.some(([g, a, cc]) => c.G === g && c.A === a && c.C === cc);
const validPartial = (c) => c.G <= MAX.G && c.A <= MAX.A && c.C <= MAX.C && FORMATIONS.some(([g, a, cc]) => c.G <= g && c.A <= a && c.C <= cc);

function autoLineup(players) {
  const sorted = players.slice().sort((a, b) => (b.pdk || 0) - (a.pdk || 0));
  let best = null;
  FORMATIONS.forEach(([g, a, c]) => {
    const need = { G: g, A: a, C: c }; const pick = [];
    sorted.forEach((p) => { if (need[p.role] > 0) { pick.push(p); need[p.role] -= 1; } });
    if (Object.values(need).every((v) => v === 0)) {
      const score = pick.reduce((s, p) => s + (p.pdk || 0), 0);
      if (!best || score > best.score) best = { score, pick };
    }
  });
  const l = empty(); const used = new Set();
  (best?.pick || []).forEach((p, i) => { l.starters[i] = p.name; used.add(p.name); });
  const rest = sorted.filter((p) => !used.has(p.name));
  l.sixth = rest[0]?.name || null;
  l.bench = [1, 2, 3, 4].map((i) => rest[i]?.name || null);
  l.tribuna = rest.slice(5).map((p) => p.name);
  l.captain = best?.pick?.[0]?.name || null;
  return l;
}

function normalize(saved, names) {
  const keep = (n) => (n && names.includes(n) ? n : null);
  const l = {
    starters: [0, 1, 2, 3, 4].map((i) => keep(saved.starters?.[i])), sixth: keep(saved.sixth),
    bench: [0, 1, 2, 3].map((i) => keep(saved.bench?.[i])), tribuna: (saved.tribuna || []).filter((n) => names.includes(n)), captain: keep(saved.captain),
  };
  const placed = new Set([...l.starters, l.sixth, ...l.bench, ...l.tribuna].filter(Boolean));
  names.forEach((n) => { if (!placed.has(n)) l.tribuna.push(n); });
  return l;
}

const getSlot = (l, s) => (s[0] === 'S' ? l.starters[+s.slice(1)] : s === 'X' ? l.sixth : s[0] === 'B' ? l.bench[+s.slice(1)] : l.tribuna[+s.slice(1)]);
function setSlot(l, s, v) {
  if (s[0] === 'S') l.starters[+s.slice(1)] = v; else if (s === 'X') l.sixth = v; else if (s[0] === 'B') l.bench[+s.slice(1)] = v; else l.tribuna[+s.slice(1)] = v;
}
const clone = (l) => JSON.parse(JSON.stringify(l));
const compactTribuna = (l) => { l.tribuna = l.tribuna.filter(Boolean); return l; };
const allSlots = (l) => ['S0', 'S1', 'S2', 'S3', 'S4', 'X', 'B0', 'B1', 'B2', 'B3', ...l.tribuna.map((_, i) => `T${i}`)];
const weight = (slot) => SLOT_WEIGHT[slot[0]];

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function PCard({ p, slot, label, isCaptain, onClick, onPointerDown, state, showCr }) {
  const cls = ['pcard', state].filter(Boolean).join(' ');
  if (!p) {
    return (
      <div className={`${cls} empty`} data-slot={slot} onClick={onClick} role="button" tabIndex={0}>
        <div className="add">＋<br />{label}</div>
      </div>
    );
  }
  let meta;
  if (showCr) meta = <><div><b>{fmt(p.dk?.cr)}</b><small>CR</small></div><div><b>{fmt(p.salary)}</b><small>STIP.</small></div></>;
  else if (p.resting) meta = <div style={{ gridColumn: '1 / -1' }}><b>{fmt(p.pdk)}</b><small>RIPOSO · MEDIA</small></div>;
  else if (p.started) meta = <div style={{ gridColumn: '1 / -1' }}><b>{fmt(p.points * (isCaptain ? CAPTAIN_MULT : 1), 2)}</b><small>PT{isCaptain ? ` ×${CAPTAIN_MULT}` : ''}{p.match?.status === 'played' ? '' : ' · LIVE'}</small></div>;
  else if (p.match) meta = <div style={{ gridColumn: '1 / -1' }}><b>T{p.match.round} <span style={{ fontSize: 11 }}>{p.match.home ? 'vs' : '@'}</span> {p.match.opp}</b><small>{fmtDay(p.match.startedAt)} {fmtTime(p.match.startedAt)}</small></div>;
  else meta = <div style={{ gridColumn: '1 / -1' }}><b>{fmt(p.pdk)}</b><small>PDK</small></div>;
  return (
    <div className={cls} data-slot={slot} onClick={onClick} onPointerDown={onPointerDown} role="button" tabIndex={0}>
      {isCaptain && <span className="cbadge">C</span>}
      {p.injured && <span className="flag inj">+</span>}
      {!p.injured && p.dk && p.dk.gs === 0 && p.dk.gp > 0 && <span className="flag bench" title="Parte dalla panchina">▬</span>}
      <Jersey team={p.dk?.team || p.team} number={p.dk?.num} />
      <div className="plate">
        <div className="name"><i>{p.role}</i>{p.last}</div>
        <div className="meta">{meta}</div>
      </div>
    </div>
  );
}

export default function Lineup() {
  const { fid: routeFid } = useParams();
  const nav = useNavigate();
  const { franchises, franchiseById, myFranchiseId, isAdmin, playerByKey, playersMeta, config, user, live, e2e } = useData();
  const fid = routeFid || myFranchiseId || franchises[0]?.id;
  const f = franchiseById[fid];
  const canEdit = !!f && (isAdmin || fid === myFranchiseId);
  const now = useNow();
  const schedule = live?.schedule;
  const mdState = matchdayState(schedule, now);

  const roster = useMemo(() => (f?.roster || [])
    .filter((p) => ['G', 'A', 'C'].includes(p.role) && salaryOf(p) > 0)
    .map((p) => {
      const dk = playerByKey[keyOf(p.name)];
      const match = matchFor(dk?.team || p.team, schedule);
      const pts = dk ? live?.points?.[String(dk.id)] : null;
      const points = pts ? Object.values(pts).reduce((s, v) => s + v, 0) : 0;
      const firstStarted = schedule ? hasStarted({ startedAt: schedule.rounds?.[0]?.matches?.[0]?.startedAt }, now) : false;
      return {
        ...p, dk, pdk: dk?.pdk || 0, salary: salaryOf(p), last: p.name.split(' ').slice(1).join(' ') || p.name,
        injured: (f.injured || []).some((x) => x.name === p.name),
        match, resting: !!schedule && !match, started: match ? hasStarted(match, now) : (!!schedule && firstStarted), points,
      };
    }), [f, playerByKey, schedule, live?.points, now]);
  const byName = useMemo(() => Object.fromEntries(roster.map((p) => [p.name, p])), [roster]);
  const roleOf = useCallback((n) => byName[n]?.role, [byName]);
  const played = useCallback((n) => !!byName[n]?.started, [byName]);

  const [saved, setSaved] = useState(undefined);
  const [l, setL] = useState(null);
  const [history, setHistory] = useState([]);
  const [sel, setSel] = useState(null);
  const [subFrom, setSubFrom] = useState(null);
  const [capMode, setCapMode] = useState(false);
  const [picker, setPicker] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCr, setShowCr] = useState(false);
  const [panel, setPanel] = useState('rosa');
  const [drag, setDrag] = useState(null); // { from, x, y, over }
  const [flashSlots, setFlashSlots] = useState([]);
  const pointerY = useRef(0);
  const dragRef = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!fid) return undefined;
    setSaved(undefined);
    if (e2e) { let v = null; try { v = JSON.parse(localStorage.getItem(`mcc-e2e-lineup-${fid}`)); } catch { /* */ } setSaved(v); return undefined; }
    return onSnapshot(doc(db, 'lineups', fid), (s) => setSaved(s.exists() ? s.data() : null), () => setSaved(null));
  }, [fid, e2e]);

  const rosterNames = useMemo(() => roster.map((p) => p.name).join('|'), [roster]);
  useEffect(() => {
    if (saved === undefined || !roster.length) return;
    const names = roster.map((p) => p.name);
    setL(saved ? normalize(saved, names) : autoLineup(roster));
    setHistory([]);
  }, [saved, rosterNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (m, ms = 2400) => { setToast(m); setTimeout(() => setToast(null), ms); };
  const commit = (next) => { setHistory((h) => [...h, l]); setL(next); };
  const dirty = useMemo(() => {
    if (!l || !canEdit) return false;
    const base = saved ? normalize(saved, roster.map((p) => p.name)) : null;
    return JSON.stringify(base) !== JSON.stringify(l);
  }, [l, saved, roster, canEdit]);

  // ---- regole di spostamento (come Dunkest) ----
  const slotOf = (lineup, name) => allSlots(lineup).find((s) => getSlot(lineup, s) === name);
  function moveError(lineup, a, b) {
    const va = getSlot(lineup, a); const vb = getSlot(lineup, b);
    // chi ha già giocato non può salire di posizione (es. dalla panchina al quintetto)
    if (va && played(va) && weight(b) > weight(a)) return `${byName[va].last} ha già giocato: non può entrare`;
    if (vb && played(vb) && weight(a) > weight(b)) return `${byName[vb].last} ha già giocato: non può entrare`;
    const next = clone(lineup); setSlot(next, a, vb); setSlot(next, b, va);
    const c = counts(next.starters, roleOf);
    if (!validPartial(c)) return `Modulo non valido (${c.G}-${c.A}-${c.C}). Ammessi: 2-2-1, 1-2-2, 1-3-1, 2-1-2, 3-1-1`;
    return null;
  }
  function trySwap(a, b) {
    const err = moveError(l, a, b);
    if (err) { flash(err); return false; }
    const next = clone(l);
    const va = getSlot(next, a); const vb = getSlot(next, b);
    setSlot(next, a, vb); setSlot(next, b, va);
    if (next.captain && !next.starters.includes(next.captain)) next.captain = null;
    commit(compactTribuna(next));
    setFlashSlots([a, b]); setTimeout(() => setFlashSlots([]), 750);
    navigator.vibrate?.(10);
    return true;
  }
  function setCaptain(name) {
    if (!l.starters.includes(name)) { flash('Il capitano deve essere nel quintetto'); return; }
    if (played(name) && l.captain !== name) { flash(`${byName[name].last} ha già giocato: non può diventare capitano`); return; }
    if (l.captain && played(l.captain) && l.captain !== name) { flash('Il capitano attuale ha già giocato: non si può più cambiare'); return; }
    commit({ ...clone(l), captain: name });
  }

  // ---- drag & drop ----
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current; if (!d) return;
      const dx = e.clientX - d.sx; const dy = e.clientY - d.sy; const dist = Math.hypot(dx, dy);
      if (!d.active) {
        if (d.type === 'mouse' && dist > 6) d.active = true;
        else if (d.type !== 'mouse' && dist > 10) { clearTimeout(d.timer); dragRef.current = null; return; }
        else return;
      }
      pointerY.current = e.clientY;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]');
      const over = el?.dataset.slot && el.dataset.slot !== d.from ? el.dataset.slot : null;
      setDrag({ from: d.from, x: e.clientX, y: e.clientY, over });
    };
    const up = () => {
      const d = dragRef.current; dragRef.current = null; if (!d) return;
      clearTimeout(d.timer);
      if (d.active) {
        suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 50);
        setDrag((cur) => { if (cur?.over) setTimeout(() => trySwapRef.current(cur.from, cur.over), 0); return null; });
      }
    };
    const touchMove = (e) => { if (dragRef.current?.active) e.preventDefault(); };
    let raf = 0;
    const autoScroll = () => {
      if (dragRef.current?.active) {
        const y = pointerY.current; const h = window.innerHeight; const edge = 90;
        if (y < edge + 60) window.scrollBy(0, -Math.ceil((edge + 60 - y) / 6));
        else if (y > h - edge - 70) window.scrollBy(0, Math.ceil((y - (h - edge - 70)) / 6));
      }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up); window.removeEventListener('touchmove', touchMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  const trySwapRef = useRef(trySwap);
  trySwapRef.current = trySwap;
  const startPress = (slot) => (e) => {
    if (!canEdit || !getSlot(l, slot) || capMode || subFrom) return;
    if (e.button && e.button !== 0) return;
    if (e.pointerType === 'mouse') e.preventDefault(); // niente selezione del testo trascinando col mouse
    const d = { from: slot, sx: e.clientX, sy: e.clientY, type: e.pointerType, active: false };
    pointerY.current = e.clientY;
    if (e.pointerType !== 'mouse') {
      d.timer = setTimeout(() => {
        if (dragRef.current === d) { d.active = true; navigator.vibrate?.(15); setDrag({ from: slot, x: d.sx, y: d.sy, over: null }); }
      }, 200);
    }
    dragRef.current = d;
  };

  if (!f) return <Spinner />;
  if (!roster.length) return <div className="card pad">Nessun giocatore a contratto per {f.name}.</div>;
  if (!l) return <Spinner />;

  const startersCount = counts(l.starters, roleOf);
  const formation = `${startersCount.G}-${startersCount.A}-${startersCount.C}`;
  // punteggio live (punti reali per chi ha giocato) e proiezione (media PDK per chi deve giocare)
  const scoreOf = (n, w, proj) => {
    const p = byName[n]; if (!p) return 0;
    const base = p.resting ? p.pdk : p.started ? p.points : (proj ? p.pdk : 0);
    return base * w * (n === l.captain ? CAPTAIN_MULT : 1);
  };
  const total = (proj) => l.starters.reduce((s, n) => s + scoreOf(n, 1, proj), 0) + scoreOf(l.sixth, 1, proj) + l.bench.reduce((s, n) => s + scoreOf(n, 0.5, proj), 0);
  const liveFpt = total(false);
  const projected = total(true);

  function onCard(slot) {
    if (suppressClick.current) return;
    const name = getSlot(l, slot);
    if (!canEdit) { if (name) setSel(slot); return; }
    if (capMode) { if (name) setCaptain(name); setCapMode(false); return; }
    if (subFrom) {
      if (subFrom !== slot && trySwap(subFrom, slot)) { setSubFrom(null); flash('Sostituzione effettuata'); }
      return;
    }
    if (!name) { setPicker(slot); return; }
    setSel(slot);
  }
  function placeFromPicker(name) {
    const from = slotOf(l, name);
    if (from && trySwap(picker, from)) setPicker(null);
  }
  function removeToTribuna(slot) {
    const n = getSlot(l, slot);
    const next = clone(l); setSlot(next, slot, null); next.tribuna.push(n);
    if (next.captain === n) next.captain = null;
    commit(compactTribuna(next)); setSel(null);
  }
  async function save() {
    const c = counts(l.starters, roleOf);
    if (!validFull(c)) { flash(`Quintetto incompleto o modulo non valido (${c.G}-${c.A}-${c.C})`); return; }
    // i 10 posti tra quintetto e panchina devono essere tutti pieni (ruoli liberi in panchina)
    const emptyBench = [l.sixth, ...l.bench].filter((x) => !x).length;
    if (emptyBench > 0) { flash(`Completa la panchina: ${emptyBench === 1 ? 'manca 1 giocatore' : `mancano ${emptyBench} giocatori`} (6° uomo + 4 panchinari)`); return; }
    if (!l.captain) { flash('Scegli il capitano (tasto CAP)'); return; }
    if (e2e) { try { localStorage.setItem(`mcc-e2e-lineup-${fid}`, JSON.stringify(l)); } catch { /* */ } setSaved({ ...l, updatedBy: 'test' }); flash('Formazione salvata ✓'); return; }
    try {
      const md = live?.matchday?.number || config.matchday || null;
      await setDoc(doc(db, 'lineups', fid), { ...l, matchday: md, updatedAt: serverTimestamp(), updatedBy: user.displayName || 'GM' });
      // storico non modificabile con l'orario del server: serve al calcolo ufficiale dei punti
      await addDoc(collection(db, 'lineups', fid, 'history'), { ...l, matchday: md, savedAt: serverTimestamp(), by: user.uid });
      flash('Formazione salvata ✓');
    } catch (e) { flash(`Errore: ${e.code || e.message}`); }
  }
  function share() {
    const nm = (n) => (n ? `${n}${n === l.captain ? ' (C)' : ''}` : '—');
    const text = `${f.name} · G${live?.matchday?.number || ''}\nQuintetto (${formation}): ${l.starters.map(nm).join(', ')}\n6° uomo: ${nm(l.sixth)}\nPanchina: ${l.bench.map(nm).join(', ')}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => flash('Formazione copiata: incollala su WhatsApp'));
  }

  // stato visivo delle carte durante sostituzione / drag
  const cardState = (slot) => {
    if (flashSlots.includes(slot)) return 'swapped';
    if (drag?.from === slot) return 'dragging';
    const src = subFrom || drag?.from;
    if (drag?.from === slot || subFrom === slot) return 'selected';
    if (src) {
      if (slot === drag?.over) return moveError(l, src, slot) ? 'drop-bad' : 'drop-over';
      return moveError(l, src, slot) ? 'locked' : 'eligible';
    }
    return '';
  };

  // posizioni sul campo: centri in alto, ali al centro, guardie in basso
  const ROW_Y = { C: 16, A: 49, G: 82 };
  const placed = l.starters.map((n, i) => ({ n, i, role: n ? roleOf(n) : null }));
  const filled = { G: [], A: [], C: [] };
  placed.filter((x) => x.n).forEach((x) => filled[x.role].push(x));
  const target = FORMATIONS.find(([g, a, c]) => filled.G.length <= g && filled.A.length <= a && filled.C.length <= c) || [2, 2, 1];
  const need = { G: target[0] - filled.G.length, A: target[1] - filled.A.length, C: target[2] - filled.C.length };
  placed.filter((x) => !x.n).forEach((x) => { const r = ['C', 'A', 'G'].find((k) => need[k] > 0) || 'G'; need[r] -= 1; x.role = r; filled[r].push(x); });
  const courtSlots = [];
  ['C', 'A', 'G'].forEach((r) => filled[r].forEach((x, k, arr) => {
    const xs = arr.length === 1 ? [50] : arr.length === 2 ? [31, 69] : [20, 50, 80];
    courtSlots.push({ ...x, x: xs[k], y: ROW_Y[r] + (r === 'A' && arr.length === 3 && k === 1 ? -6 : 0) });
  }));

  const selName = sel ? getSlot(l, sel) : null;
  const selP = selName ? byName[selName] : null;
  const pickerOptions = picker ? roster.filter((p) => {
    const from = slotOf(l, p.name);
    return from && from !== picker && !moveError(l, picker, from) && !(picker[0] === 'S' && from[0] === 'S');
  }).sort((a, b) => b.pdk - a.pdk) : [];

  const card = (slot, label) => {
    const n = getSlot(l, slot);
    return <PCard key={slot} slot={slot} p={byName[n]} label={label} isCaptain={n && n === l.captain} onClick={() => onCard(slot)} onPointerDown={startPress(slot)} state={cardState(slot)} showCr={showCr} />;
  };

  const rosterList = (
    <div className="plist">
      {roster.slice().sort((a, b) => b.pdk - a.pdk).map((p) => {
        const s = slotOf(l, p.name);
        const where = !s ? '' : s[0] === 'S' ? 'Quintetto' : s === 'X' ? '6° uomo' : s[0] === 'B' ? 'Panchina' : 'Tribuna';
        return (
          <div key={p.name} className={`prow ${s ? cardState(s) : ''}`} data-slot={s} onClick={() => s && onCard(s)} onPointerDown={s ? startPress(s) : undefined}>
            <Jersey team={p.dk?.team || p.team} number={p.dk?.num} />
            <div style={{ minWidth: 0 }}>
              <div className="nm"><RoleTag role={p.role} /> {p.name} {p.name === l.captain && <span className="pill warn">C</span>}</div>
              <div className="bar"><i style={{ width: `${Math.min(100, p.pdk * 2.5)}%` }} /></div>
              <div className="sub">
                <span>{where} · {p.resting ? 'riposo' : p.match ? `T${p.match.round} ${p.match.home ? 'vs' : '@'} ${p.match.opp}` : '–'}</span>
                <span>{p.started && !p.resting ? `${fmt(p.points, 2)} pt` : `PDK ${fmt(p.pdk)}`}</span>
              </div>
            </div>
            <div className="cr">{fmt(p.salary)}</div>
          </div>
        );
      })}
    </div>
  );

  const calendar = (
    <div className="grid" style={{ gap: 10 }}>
      {(schedule?.rounds || []).map((r) => (
        <div key={r.number} className="card" style={{ overflow: 'hidden' }}>
          <div className="row between pad" style={{ padding: '10px 14px', background: 'var(--surface-2)' }}>
            <b>Turno {r.number}</b><span className="small muted">{fmtDay(r.matches[0]?.startedAt)}</span>
          </div>
          <table><tbody>
            {r.matches.map((m) => {
              const mine = roster.some((p) => (p.dk?.team || p.team) === m.home || (p.dk?.team || p.team) === m.away);
              return (
                <tr key={m.id} style={mine ? { background: 'rgba(242,169,0,.12)' } : undefined}>
                  <td className="small muted" style={{ width: 54 }}>{fmtTime(m.startedAt)}</td>
                  <td style={{ fontWeight: 600 }}>{m.away} <span className="muted">@</span> {m.home}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{m.status === 'played' ? `${m.as}-${m.hs}` : hasStarted(m, now) ? <span className="pill bad">LIVE</span> : ''}</td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      ))}
      {!schedule && <p className="muted">Calendario non ancora sincronizzato.</p>}
    </div>
  );

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="tcell" style={{ minWidth: 0 }}><FranchiseLogo f={f} size={40} /><select aria-label="Franchigia" value={fid} onChange={(e) => nav(`/app/formazione/${e.target.value}`)} style={{ width: 'auto', maxWidth: '100%' }}>
          {franchises.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === myFranchiseId ? ' (tu)' : ''}</option>)}
        </select></span>
        {!canEdit && <span className="pill">Sola lettura</span>}
      </div>
      {dirty && <div className="unsaved">{saved ? '● Modifiche non salvate' : '● Formazione proposta: premi Salva per confermarla'}</div>}

      <div className="lu-layout">
        <div className="lu">
          <div className="lu-head">
            <div className="top">
              <div><b>{live?.matchday?.number || config.matchday || '–'}</b><small>GIORNATA</small></div>
              <div><b>{mdState.round}/{mdState.total || live?.matchday?.numRounds || '–'}</b><small>TURNO</small></div>
              <div>
                {mdState.open ? <span className="badge-open">{mdState.label}</span> : <span className="badge-closed">{mdState.label}</span>}
                <small style={{ display: 'block', marginTop: 3 }}>{mdState.countdownTo ? countdown(mdState.countdownTo, now) : formation}</small>
              </div>
            </div>
            <div className="bot">
              <div><b className="num">{fmt(liveFpt, 2)}</b><small>FPT GIORNATA</small></div>
              <div><b className="num">{fmt(projected, 1)}</b><small>PROIEZIONE</small></div>
            </div>
          </div>

          <div className="court-wrap">
            <div className="side-tools left">
              <button className="cap" onClick={() => canEdit && setCapMode((v) => !v)} aria-pressed={capMode} title="Scegli capitano">{capMode ? '…' : 'CAP'}</button>
              <button onClick={() => setShowCr((v) => !v)} title="Mostra crediti Dunkest e stipendi">{showCr ? 'PT' : 'CR'}</button>
              <button onClick={() => { if (history.length) { setL(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); } }} disabled={!history.length} title="Annulla ultima modifica"><Icon.undo /></button>
            </div>
            <div className="side-tools right">
              <button onClick={share} title="Condividi"><Icon.share /></button>
              <button onClick={() => flash('Tieni premuto e trascina un giocatore su un altro per scambiarli, oppure toccalo: Capitano, Sostituisci, Tribuna.', 4000)} title="Aiuto"><Icon.help /></button>
            </div>
            <div className="court" />
            <div className="slots">
              {courtSlots.map((s) => (
                <div key={s.i} className="slot" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                  {card(`S${s.i}`, ROLE_LABEL[s.role])}
                </div>
              ))}
            </div>
          </div>
          {capMode && <p className="small" style={{ textAlign: 'center', margin: '10px 0 0', fontWeight: 700 }}>Tocca un titolare per nominarlo capitano (×{CAPTAIN_MULT})</p>}

          <div className="lu-lower">
            <div className="lu-row">
              <div><div className="lu-group-title">6° UOMO (100%)</div>{card('X', '6° UOMO')}</div>
              <div className="bench-box"><div className="lu-group-title">PANCHINA (50%)</div><div className="bench-grid">{['B0', 'B1', 'B2', 'B3'].map((s) => card(s, 'PANCHINA'))}</div></div>
            </div>
            {l.tribuna.length > 0 && (
              <>
                <div className="lu-group-title" style={{ marginTop: 16 }}>TRIBUNA (0%)</div>
                <div className="tribuna-grid">{l.tribuna.map((_, i) => card(`T${i}`, 'TRIBUNA'))}</div>
              </>
            )}
            {canEdit && (
              <div className="lu-actions">
                <button className="btn ghost" style={{ color: 'var(--marble)' }} disabled={!dirty} onClick={() => { setL(saved ? normalize(saved, roster.map((p) => p.name)) : autoLineup(roster)); setHistory([]); flash('Modifiche annullate'); }}>Annulla</button>
                <button className="btn red" disabled={!dirty && !!saved} onClick={save}>Salva</button>
              </div>
            )}
            {saved?.updatedAt && <p className="small" style={{ textAlign: 'center', opacity: 0.6, margin: '10px 0 0' }}>Ultimo salvataggio: {saved.updatedAt.toDate?.().toLocaleString('it-IT')} · {saved.updatedBy}</p>}
          </div>
        </div>

        <div className="card pad lu-panel">
          <div className="tabs" style={{ marginBottom: 12 }}>
            {[['rosa', 'Rosa'], ['cal', `Calendario G${live?.matchday?.number || ''}`]].map(([k, lb]) => <button key={k} className={`tab ${panel === k ? 'on' : ''}`} onClick={() => setPanel(k)}>{lb}</button>)}
          </div>
          {panel === 'rosa' ? rosterList : calendar}
          <p className="small muted" style={{ marginTop: 10 }}>Dati Dunkest{live?.updatedAt ? ` aggiornati ${live.updatedAt.toDate().toLocaleString('it-IT')}` : playersMeta?.updatedAt ? ` aggiornati ${playersMeta.updatedAt.toDate().toLocaleString('it-IT')}` : ''} · orari italiani</p>
        </div>
      </div>

      {subFrom && (
        <button className="sub-bar" onClick={() => { setSubFrom(null); flash('Sostituzione annullata'); }}><Icon.x /> Annulla sostituzioni</button>
      )}

      {drag && (() => {
        const p = byName[getSlot(l, drag.from)];
        return p ? (
          <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
            <div className="pcard"><Jersey team={p.dk?.team || p.team} number={p.dk?.num} /><div className="plate"><div className="name"><i>{p.role}</i>{p.last}</div></div></div>
            {drag.over && <div className={`ghost-hint ${moveError(l, drag.from, drag.over) ? 'bad' : 'ok'}`}>{moveError(l, drag.from, drag.over) ? 'Non ammesso' : `Scambia con ${byName[getSlot(l, drag.over)]?.last || 'slot vuoto'}`}</div>}
          </div>
        ) : null;
      })()}

      {selP && (
        <Sheet onClose={() => setSel(null)}>
          <div className="row pd-head" style={{ gap: 14 }}>
            <Jersey team={selP.dk?.team || selP.team} number={selP.dk?.num} />
            <div>
              <div className="small muted">{selP.name.split(' ')[0]}</div>
              <h2 style={{ fontSize: 22 }}>{selP.last}</h2>
              <div className="small muted">{ROLE_LABEL[selP.role]} · {selP.dk?.team || selP.team}</div>
            </div>
            <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => setSel(null)} aria-label="Chiudi"><Icon.x /></button>
          </div>
          <div className="stat-strip" style={{ marginTop: 14 }}>
            <div><b>{fmt(selP.dk?.cr)}</b><small>CREDITI</small></div>
            <div><b>{fmt(selP.pdk)}</b><small>PDK</small></div>
            <div><b>{selP.started && !selP.resting ? fmt(selP.points, 2) : '–'}</b><small>PT G{live?.matchday?.number || ''}</small></div>
            <div><b>{fmt(selP.salary)}</b><small>STIPENDIO</small></div>
          </div>
          {canEdit && (
            <div className="action-row">
              <button onClick={() => { setCaptain(selName); setSel(null); }}><span className={`ic ${l.captain === selName ? 'on' : ''}`}>C</span>Capitano</button>
              <button onClick={() => { setSubFrom(sel); setSel(null); }}><span className="ic red"><Icon.swap /></span>Sostituisci</button>
              {sel[0] !== 'T' && <button onClick={() => removeToTribuna(sel)}><span className="ic">↓</span>Tribuna</button>}
            </div>
          )}
          {selP.dk ? <PlayerDetail player={selP.dk} /> : <p className="muted small">Statistiche Dunkest non disponibili per questo giocatore.</p>}
          <p className="small muted">Contratto: {Object.entries(selP.salaries || {}).map(([s, v]) => `${s.slice(2, 4)}/${s.slice(7)} ${fmt(v)}`).join(' · ')}</p>
        </Sheet>
      )}

      {picker && (
        <Sheet onClose={() => setPicker(null)}>
          <div className="row between"><h3>Scegli {picker[0] === 'S' ? 'titolare' : picker === 'X' ? '6° uomo' : 'panchinaro'}</h3><button className="btn sm ghost" onClick={() => setPicker(null)}><Icon.x /></button></div>
          <div className="plist" style={{ marginTop: 12 }}>
            {pickerOptions.map((p) => (
              <div key={p.name} className="prow" onClick={() => placeFromPicker(p.name)}>
                <Jersey team={p.dk?.team || p.team} number={p.dk?.num} />
                <div>
                  <div className="nm"><RoleTag role={p.role} /> {p.name}</div>
                  <div className="sub"><span>{p.match ? `T${p.match.round} ${p.match.home ? 'vs' : '@'} ${p.match.opp}` : 'riposo'}</span><span>PDK {fmt(p.pdk)}</span></div>
                </div>
                <div className="cr">{fmt(p.dk?.cr)}</div>
              </div>
            ))}
            {!pickerOptions.length && <p className="muted">Nessun giocatore disponibile: chi ha già giocato non può entrare e il modulo deve restare valido.</p>}
          </div>
        </Sheet>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
