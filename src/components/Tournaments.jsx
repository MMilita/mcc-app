// Tornei MCC: In-Season Tournament, Play-In, Playoff, Playout (calcolati dai punti Dunkest)
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useData, fmt } from '../lib/data';
import { normTeam, useH2H } from '../lib/h2h';
import { bracket8, game, istGroupMds, istGroupTable, istKnockout, istPots, istSchedule, parseMds, playIn, pointsIndex, standingsAt } from '../lib/tournaments';
import { FranchiseLogo, Spinner } from './ui';

export function useTournamentsConfig() {
  const [cfg, setCfg] = useState(undefined);
  useEffect(() => onSnapshot(doc(db, 'league', 'tournaments'), (s) => setCfg(s.data() || {}), () => setCfg({})), []);
  return cfg;
}

const STATUS = { played: 'Finale', live: 'In corso', scheduled: 'Da giocare', tbd: 'Da definire' };

function Team({ name, score, win, home, seed }) {
  const { franchises } = useData();
  const f = franchises.find((x) => normTeam(x.name) === normTeam(name || ''));
  return (
    <div className={`tg-team ${win ? 'win' : ''}`}>
      {seed && <span className="tg-seed">{seed}</span>}
      {f ? <FranchiseLogo f={f} size={24} /> : <span className="tg-ph" />}
      <span className="tg-name">{f?.name || name || 'Da definire'}{home && <small title="Fattore campo +15"> · casa</small>}</span>
      <b className="num">{score != null ? fmt(score, 2) : ''}</b>
    </div>
  );
}

function GameCard({ g, label, seeds }) {
  const seedOf = (t) => (seeds ? seeds.indexOf(t) + 1 || null : null);
  return (
    <div className={`tg-card ${g.status}`}>
      <div className="tg-meta"><span>{label}</span><span>{g.md ? `G${g.md}` : ''} · {STATUS[g.status] || ''}</span></div>
      <Team name={g.a} score={g.pa} win={g.winner && g.winner === g.a} home={g.home && g.home === g.a} seed={seedOf(g.a)} />
      <Team name={g.b} score={g.pb} win={g.winner && g.winner === g.b} home={g.home && g.home === g.b} seed={seedOf(g.b)} />
    </div>
  );
}

function SeriesCard({ s, label, seeds }) {
  const name = (x) => (typeof x === 'string' ? x : x?.placeholder || '');
  const seedOf = (t) => (typeof t === 'string' && seeds ? seeds.indexOf(t) + 1 || null : null);
  return (
    <div className={`tg-card ${s.winner ? 'played' : s.tbd ? 'tbd' : 'live'}`}>
      <div className="tg-meta"><span>{label}</span><span>{s.tbd ? 'Da definire' : s.winner ? 'Conclusa' : `Al meglio di ${s.bestOf}`}</span></div>
      <Team name={name(s.hi)} score={s.tbd ? null : s.wh} win={s.winner && s.winner === s.hi} seed={seedOf(s.hi)} />
      <Team name={name(s.lo)} score={s.tbd ? null : s.wl} win={s.winner && s.winner === s.lo} seed={seedOf(s.lo)} />
      {s.games?.length > 0 && (
        <div className="tg-games">{s.games.map((g) => <span key={g.n} className={g.status} title={`Gara ${g.n} · G${g.md}`}>G{g.n}: {g.pa != null ? `${fmt(g.pa, 1)}-${fmt(g.pb, 1)}` : `G${g.md}`}</span>)}</div>
      )}
    </div>
  );
}

function Bracket({ b, seeds, titles = ['Quarti', 'Semifinali', 'Finale'] }) {
  return (
    <div className="tg-bracket">
      <div className="tg-col"><h4>{titles[0]}</h4>{b.qf.map((s, i) => <SeriesCard key={i} s={s} label={`Quarto ${i + 1}`} seeds={seeds} />)}</div>
      <div className="tg-col"><h4>{titles[1]}</h4>{b.sf.map((s, i) => <SeriesCard key={i} s={s} label={`Semifinale ${i + 1}`} seeds={seeds} />)}</div>
      <div className="tg-col"><h4>{titles[2]}</h4><SeriesCard s={b.f} label="Finale" seeds={seeds} />
        {b.champion && <div className="tg-champ">Campione: {b.champion.replace(/[^\p{L}\p{N} ]/gu, '').trim()}</div>}
      </div>
      {b.places && (
        <>
          <div className="tg-col"><h4>Piazzamenti 5°-8°</h4>{b.places.c58.map((s, i) => <SeriesCard key={i} s={s} label={`Semifinale 5°-8° ${i + 1}`} seeds={seeds} />)}</div>
          <div className="tg-col"><h4>Finali piazzamento</h4>
            <SeriesCard s={b.places.p3} label="3° posto" seeds={seeds} />
            <SeriesCard s={b.places.p5} label="5° posto" seeds={seeds} />
            <SeriesCard s={b.places.p7} label="7° posto" seeds={seeds} />
          </div>
        </>
      )}
    </div>
  );
}

export default function Tournaments() {
  const { loading, matchdays, meta } = useH2H();
  const cfg = useTournamentsConfig();
  const [tab, setTab] = useState('ist');
  const current = meta?.currentMatchday || 1;
  const idx = useMemo(() => pointsIndex(matchdays), [matchdays]);
  if (loading || cfg === undefined) return <Spinner />;

  const ist = cfg.ist || {};
  const rsLast = cfg.rs?.lastMd || 30;
  const rsRows = standingsAt(matchdays, Math.min(rsLast, current));
  const refRows = standingsAt(matchdays, Math.min(ist.refMd || 15, current));

  // ----- In-Season -----
  const istView = () => {
    const pots = ist.pots || istPots(refRows);
    if (!ist.groups) {
      return (
        <div className="grid">
          <p className="muted">Sorteggio dei gironi non ancora effettuato. Fasce provvisorie in base alla classifica dopo la G{Math.min(ist.refMd || 15, current)}:</p>
          <div className="tg-pots">{pots.map((p, i) => <div key={i} className="card pad"><h4>Fascia {i + 1}</h4>{p.map((t) => <Team key={t} name={t} />)}</div>)}</div>
        </div>
      );
    }
    const gmds = istGroupMds(ist);
    const rounds = istSchedule(ist.groups, pots, gmds);
    const played = rounds.flatMap((r) => r.games.map((g) => game(idx, current, g.a, g.b, r.md)));
    const tables = Object.fromEntries(Object.entries(ist.groups).map(([g, ts]) => [g, istGroupTable(ts, played, rsRows)]));
    const groupsDone = current > Math.max(...gmds);
    const ko = istKnockout({ ...ist, groupsDone }, tables, idx, current);
    return (
      <div className="grid">
        <div className="tg-groups">
          {Object.entries(tables).map(([g, rows]) => (
            <div key={g} className="card table-wrap">
              <div className="pad" style={{ paddingBottom: 0 }}><h3>Girone {g}</h3></div>
              <table><thead><tr><th>#</th><th>Franchigia</th><th>V</th><th>P</th><th>PF</th></tr></thead>
                <tbody>{rows.map((r, i) => <tr key={r.team} className={i < 2 ? 'tg-q' : ''}><td className="num">{i + 1}</td><td><Team name={r.team} /></td><td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num">{fmt(r.pf, 1)}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="small muted">Le prime due di ogni girone ai quarti. Spareggi: scontri diretti, punti nel torneo, posizione in Regular Season. Campo neutro.</p>
        <h3>Fase a eliminazione</h3>
        <div className="tg-bracket">
          <div className="tg-col"><h4>Quarti · G{ist.qfMd || 25}</h4>{ko.qf.map((g, i) => <GameCard key={i} g={g} label={`QF${i + 1}`} />)}</div>
          <div className="tg-col"><h4>Semifinali · G{ist.sfMd || 27}</h4>{ko.sf.map((g, i) => <GameCard key={i} g={g} label={`SF${i + 1}`} />)}</div>
          <div className="tg-col"><h4>Finale · G{ist.fMd || 29}</h4><GameCard g={ko.f} label="Finale" />{ko.champion && <div className="tg-champ">Vince l'In-Season: {ko.champion.replace(/[^\p{L}\p{N} ]/gu, '').trim()}</div>}</div>
        </div>
        <h3>Calendario gironi</h3>
        <div className="tg-rounds">
          {rounds.map((r) => (
            <div key={r.round} className="card pad">
              <div className="row between"><h4>Turno {r.round} · G{r.md}</h4><span className="pill">{r.kind === 'girone' ? 'Girone' : 'Fascia'}</span></div>
              {r.games.map((g, i) => <GameCard key={i} g={game(idx, current, g.a, g.b, r.md)} label={g.group ? `Girone ${g.group}` : `Fascia ${g.pot}`} />)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ----- Play-In / Playoff / Playout -----
  const pin = playIn(idx, current, rsRows, cfg.playin || {});
  const provisional = current <= rsLast;
  const poSeeds = [...rsRows.slice(0, 6).map((r) => r.team), pin.seed7 || null, pin.seed8 || null];
  const outPos = (t) => rsRows.findIndex((r) => r.team === t);
  const elim = pin.eliminated.filter(Boolean).sort((a, b) => outPos(a) - outPos(b));
  const plSeeds = [elim[0] || null, elim[1] || null, ...rsRows.slice(10, 16).map((r) => r.team)];
  const rank = (t) => { const i = outPos(t); return i < 0 ? 99 : i; };
  const po = bracket8(idx, current, poSeeds, { rank, bestOf: cfg.playoff?.bestOf || 3, qfMds: parseMds(cfg.playoff?.qfMds), sfMds: parseMds(cfg.playoff?.sfMds), fMds: parseMds(cfg.playoff?.fMds) });
  const pl = bracket8(idx, current, plSeeds, { rank, bestOf: cfg.playout?.bestOf || 3, qfMds: parseMds(cfg.playout?.qfMds), sfMds: parseMds(cfg.playout?.sfMds), fMds: parseMds(cfg.playout?.fMds) });

  return (
    <div className="grid">
      <div className="tabs" role="tablist">
        {[['ist', 'In-Season Tournament'], ['playin', 'Play-In'], ['playoff', 'Playoff'], ['playout', 'Playout']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {provisional && tab !== 'ist' && <p className="small muted">Tabellone provvisorio: la Regular Season finisce alla G{rsLast} (ora G{current}). Teste di serie in base alla classifica attuale.</p>}
      {tab === 'ist' && istView()}
      {tab === 'playin' && (
        <div className="tg-bracket">
          <div className="tg-col"><h4>Giornata 1 · G{cfg.playin?.md1 || '?'}</h4><GameCard g={pin.g1} label="7ª vs 8ª (vince: 7ª testa di serie)" /><GameCard g={pin.g2} label="9ª vs 10ª (perde: Playout)" /></div>
          <div className="tg-col"><h4>Giornata 2 · G{cfg.playin?.md2 || '?'}</h4><GameCard g={pin.g3} label="Perdente 7-8 vs Vincente 9-10 (vince: 8ª)" /></div>
          <div className="tg-col"><h4>Esito</h4>
            <div className="card pad small"><div>7ª testa di serie: <b>{pin.seed7 || '—'}</b></div><div>8ª testa di serie: <b>{pin.seed8 || '—'}</b></div><div>Ai Playout: <b>{pin.eliminated.filter(Boolean).join(', ') || '—'}</b></div><p className="muted" style={{ marginBottom: 0 }}>Fattore campo +15 alla squadra meglio classificata.</p></div>
          </div>
        </div>
      )}
      {tab === 'playoff' && <><Bracket b={po} seeds={poSeeds} /><p className="small muted">Serie al meglio di {cfg.playoff?.bestOf || 3}: gara 1, 3 e 5 in casa della squadra meglio classificata (+15 punti). Chi viene eliminato continua a giocare per i piazzamenti: gli accoppiamenti seguono il record di Regular Season (migliore contro peggiore), non il tabellone.</p></>}
      {tab === 'playout' && <><Bracket b={pl} seeds={plSeeds} titles={['Primo turno', 'Semifinali', 'Finale']} /><p className="small muted">Il Playout assegna l'ordine delle prime scelte al FantaDraft. Serie al meglio di {cfg.playout?.bestOf || 3}. Anche qui chi esce continua per i piazzamenti, accoppiato col record di Regular Season.</p></>}
    </div>
  );
}
