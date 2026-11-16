import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';

const RULES = [
  ['Rosa', 'Minimo 10 giocatori (4 G, 4 A, 2 C), massimo 15. Dei 5 extra non più di 3 dello stesso ruolo. Almeno un rookie sempre a roster.'],
  ['Salary cap', '120 milioni, calcolato a fine Regular Season. Soft cap fino all\'Apron di 150. Floor 96 (80%).'],
  ['Luxury Tax', '1 € per milione oltre il cap; 2 € se si sfora per il 2° anno consecutivo. Al 3° anno consecutivo vengono annullati i contratti più costosi.'],
  ['Contratti', 'Da 1 a 3 anni. 1° anno = valore Dunkest all\'acquisto; +50% il 2° anno, +100% il 3°. Decimali arrotondati per eccesso.'],
  ['Free agent', 'Offerta nel gruppo mercato ≥ valore Dunkest attuale. Rilanci entro 12 ore; massimo 48 ore poi busta chiusa al Commissioner. Si chiude 48 ore prima della Trade Deadline.'],
  ['Tagli', '4 a stagione, fino alla Trade Deadline. Il tagliato pesa il 50% sul cap per tutta la durata (arrotondato per difetto).'],
  ['Scambi', 'Max 3 giocatori per squadra, differenza stipendi ≤ 20, valore totale ≤ 50. Una trade al mese tra le stesse squadre. Scelte dei 3 Draft successivi scambiabili.'],
  ['Injury List', 'Out for the season (Dunkest o CBS): recupero dello slot e del 90% del contratto; il giocatore resta fermo fino alla stagione successiva.'],
  ['Calendario', 'RS ottobre-febbraio con In-Season Tournament nel girone di ritorno. 1ª-6ª ai Playoff, 7ª-10ª Play-In, 11ª-16ª Playout. Fattore campo 15 punti.'],
  ['Premi', 'MVP, ROY, 6MOY, DPOY, MIP, Clutch: 16 € a premio alla franchigia che ha il giocatore a roster.'],
];

export default function More() {
  const { user, signOut, isAdmin } = useData();
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('mcc-theme') || 'auto'; } catch { return 'auto'; } });
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('mcc-theme', theme); } catch { /* storage non disponibile */ }
  }, [theme]);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;

  return (
    <div className="grid">
      <h2>Altro</h2>
      <div className="card pad row between">
        <div className="row">{user?.photoURL && <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />}<div><b>{user?.displayName}</b><div className="small muted">{user?.email}</div></div></div>
        <button className="btn sm ghost" onClick={signOut}>Esci</button>
      </div>

      <Link to="/app/installa" className="card pad row between" style={{ textDecoration: 'none' }}>
        <div><h3>Installa l'app</h3><div className="small muted">iPhone e Android, con QR code da condividere nel gruppo</div></div>
        <span className="btn sm">{standalone ? 'Installata' : 'Apri'}</span>
      </Link>

      <div className="card pad">
        <h3>Tema</h3>
        <div className="tabs" style={{ marginTop: 10 }}>
          {[['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([k, l]) => <button key={k} className={`tab ${theme === k ? 'on' : ''}`} onClick={() => setTheme(k)}>{l}</button>)}
        </div>
      </div>

      <Link to="/app/regolamento" className="card pad row between" style={{ textDecoration: 'none' }}>
        <div><h3>Regolamento ufficiale</h3><div className="small muted">Testo integrale, con indice e ricerca</div></div>
        <span className="btn sm">Leggi</span>
      </Link>

      <Link to="/app/storico" className="card pad row between" style={{ textDecoration: 'none' }}>
        <div><h3>Storico</h3><div className="small muted">Campioni, vincitori, premi e file di ogni stagione</div></div>
        <span className="btn sm">Apri</span>
      </Link>

      <div className="card">
        <div className="pad" style={{ paddingBottom: 0 }}><h3>Regolamento in breve</h3><p className="small muted" style={{ margin: '4px 0 0' }}>Riassunto non ufficiale: fa fede il regolamento completo.</p></div>
        <table><tbody>{RULES.map(([k, v]) => <tr key={k}><td style={{ fontWeight: 700, verticalAlign: 'top', width: 110 }}>{k}</td><td className="small">{v}</td></tr>)}</tbody></table>
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Link className="btn ghost" to="/">Sito pubblico</Link>
        {isAdmin && <Link className="btn dark" to="/admin">Dashboard Commissioner</Link>}
      </div>
    </div>
  );
}
