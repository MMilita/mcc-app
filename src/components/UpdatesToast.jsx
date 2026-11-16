// Riquadro "Novità" in Home: mostra l'ultimo aggiornamento non ancora chiuso (chiudibile con la X)
import { useState } from 'react';
import { useData } from '../lib/data';
import { Icon } from './ui';

const KEY = 'mcc-seen-update';
const seen = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export default function UpdatesToast() {
  const { config } = useData();
  const latest = (config.updates || [])[0];
  const [hidden, setHidden] = useState(() => seen());
  if (!latest || hidden === latest.id) return null;
  const close = () => { try { localStorage.setItem(KEY, latest.id); } catch { /* storage non disponibile */ } setHidden(latest.id); };
  return (
    <aside className="updates-toast" role="status" aria-label="Novità dell'app">
      <div className="row between">
        <span className="pill" style={{ background: 'var(--cross)', color: '#fff', border: 0 }}>Novità · {latest.date}</span>
        <button className="ut-x" onClick={close} aria-label="Chiudi novità"><Icon.x /></button>
      </div>
      <h3 style={{ marginTop: 8 }}>{latest.title}</h3>
      <ul>{(latest.items || []).map((it, i) => <li key={i}>{it}</li>)}</ul>
    </aside>
  );
}
