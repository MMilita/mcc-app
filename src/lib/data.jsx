import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { keyOf } from './cap';

const DataCtx = createContext(null);

// Firestore (SDK web) non accetta array dentro array: le tabelle si salvano con le righe come { r: [...] }
export const packRows = (v) => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? { r: x.map(packRows) } : packRows(x)))
  : v && typeof v === 'object' && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, packRows(x)])) : v);
export const unpackRows = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && Array.isArray(x.r) ? x.r.map(unpackRows) : unpackRows(x)))
  : v && typeof v === 'object' && v.constructor === Object ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpackRows(x)])) : v);

function useLive(ref) {
  const [state, setState] = useState({ data: undefined, loading: true });
  useEffect(() => {
    if (!ref) return undefined;
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.docs ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : snap.data(), loading: false }),
      (error) => setState({ data: undefined, loading: false, error }),
    );
  }, [ref?.path ?? 'none']); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function DataProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);

  // Modalità test E2E (solo `vite dev`, esclusa dalla build): utente GM simulato per Playwright
  const e2e = import.meta.env.DEV && (() => { try { return localStorage.getItem('mcc-e2e') === '1'; } catch { return false; } })();
  useEffect(() => {
    if (!e2e) return;
    setUser({ uid: 'e2e', email: 'e2e@test.local', displayName: 'GM di test', photoURL: null });
    setProfile({ franchiseId: localStorage.getItem('mcc-e2e-fid') || 'capecelatro-red-lights' });
  }, [e2e]);

  useEffect(() => (e2e ? undefined : onAuthStateChanged(auth, async (u) => {
    setUser(u);
    if (!u) { setProfile(null); return; }
    const ref = doc(db, 'users', u.uid);
    const snap = await getDoc(ref).catch(() => null);
    const base = { email: u.email, name: u.displayName, photo: u.photoURL, lastLogin: serverTimestamp() };
    if (!snap?.exists()) {
      // franchigia pre-assegnata dal Commissioner per questa email (se presente)
      const pre = await getDoc(doc(db, 'invites', (u.email || '').toLowerCase())).then((d) => d.data()?.franchiseId).catch(() => null);
      await setDoc(ref, { ...base, createdAt: serverTimestamp(), ...(pre ? { franchiseId: pre } : {}) }).catch(() => {});
    }
    else await setDoc(ref, base, { merge: true }).catch(() => {});
  })), [e2e]);

  const profileRef = useMemo(() => (user && !e2e ? doc(db, 'users', user.uid) : null), [user, e2e]);
  useEffect(() => {
    if (!profileRef) return undefined;
    return onSnapshot(profileRef, (s) => setProfile(s.data() || null), () => setProfile(null));
  }, [profileRef]);

  const config = useLive(useMemo(() => doc(db, 'config', 'app'), []));
  const admins = useLive(useMemo(() => (user ? doc(db, 'config', 'admins') : null), [user]));
  const franchises = useLive(useMemo(() => collection(db, 'franchises'), []));
  const standings = useLive(useMemo(() => doc(db, 'league', 'standings'), []));
  const records = useLive(useMemo(() => doc(db, 'league', 'records'), []));
  const live = useLive(useMemo(() => doc(db, 'league', 'live'), []));
  const h2hPublic = useLive(useMemo(() => doc(db, 'league', 'h2h_public'), []));
  const playersCol = useLive(useMemo(() => collection(db, 'players'), []));

  const value = useMemo(() => {
    const chunks = (playersCol.data || []).filter((d) => d.id.startsWith('chunk_'));
    const players = chunks.flatMap((c) => c.players || []);
    const playersMeta = (playersCol.data || []).find((d) => d.id === 'meta');
    const fr = (franchises.data || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    // proprietario di ogni giocatore (contratti attivi)
    const owners = {};
    fr.forEach((f) => (f.roster || []).forEach((p) => { owners[keyOf(p.name)] = f.id; }));
    const byKey = {};
    players.forEach((p) => { byKey[keyOf(p.name)] = p; });
    const isAdmin = !!(user && (admins.data?.emails?.includes(user.email) || (e2e && localStorage.getItem('mcc-e2e-admin') === '1')));
    return {
      user,
      profile,
      isAdmin,
      myFranchiseId: profile?.franchiseId || null,
      config: config.data || {},
      franchises: fr,
      franchiseById: Object.fromEntries(fr.map((f) => [f.id, f])),
      standings: h2hPublic.data?.standings?.length ? {
        season: standings.data?.season || '2026/27', source: 'Dunkest · aggiornata in automatico', matchday: h2hPublic.data.matchday,
        rows: h2hPublic.data.standings.map((r) => ({ ...r, team: (standings.data?.rows || []).find((x) => x.team.toLowerCase().replace(/[^a-z]/g, '') === r.team.toLowerCase().replace(/[^a-z]/g, ''))?.team || r.team })),
        liveMatchday: (h2hPublic.data.current || []).map((m) => ({ home: m.home, hs: m.hs ?? 0, away: m.away, as: m.as ?? 0 })),
      } : standings.data,
      records: records.data ? unpackRows(records.data) : records.data,
      live: live.data,
      h2hPublic: h2hPublic.data,
      players,
      playersMeta,
      playerByKey: byKey,
      owners,
      loading: franchises.loading || config.loading,
      signIn: async () => {
        try { await signInWithPopup(auth, googleProvider); } catch (e) {
          if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, googleProvider);
          else throw e;
        }
      },
      e2e,
      signOut: () => (e2e ? (localStorage.removeItem('mcc-e2e'), window.location.assign('/')) : signOut(auth)),
    };
  }, [e2e, user, profile, admins.data, config, franchises, standings.data, records.data, live.data, h2hPublic.data, playersCol.data]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);

export function fmt(n, d = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
}
