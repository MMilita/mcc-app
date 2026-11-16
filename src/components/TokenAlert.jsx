// Avviso al Commissioner: token Dunkest scaduto o in scadenza (stato scritto dal sync in h2h/meta)
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function TokenAlert() {
  const [t, setT] = useState(null);
  useEffect(() => { getDoc(doc(db, 'h2h', 'meta')).then((s) => setT(s.data()?.token || null)).catch(() => {}); }, []);
  if (!t) return null;
  const exp = t.exp?.toDate?.() || null;
  const days = exp ? Math.floor((exp - Date.now()) / 86400000) : null;
  if (t.ok && (days == null || days > 7)) return null;
  return (
    <div className="card pad" role="alert" style={{ borderColor: 'var(--cross)', borderWidth: 2 }}>
      <b>{t.ok ? `Il token Dunkest scade tra ${days} giorni` : 'Token Dunkest scaduto: classifica, risultati e formazioni H2H non si aggiornano'}</b>
      <p className="small" style={{ margin: '6px 0 0' }}>
        Per rinnovarlo (lo fa chi gestisce il collegamento con Dunkest): su fantasy.dunkest.com, nella console di Chrome,
        <code> copy(JSON.parse(localStorage.getItem('flutter.authToken')))</code>, poi nel terminale
        <code> pbpaste | gh secret set DUNKEST_TOKEN -R MMilita/mcc-app</code>.
      </p>
    </div>
  );
}
