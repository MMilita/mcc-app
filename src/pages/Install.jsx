// Pagina pubblica /installa: come mettere l'app MCC sulla schermata Home (PWA), senza store.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const APP_URL = 'https://milano-city-championship.web.app/installa';

function detect() {
  const ua = navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);
  const safari = ios && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return { ios, android, inApp, safari, standalone };
}

export default function Install({ embedded = false }) {
  const [env] = useState(detect);
  const [tab, setTab] = useState(env.android ? 'android' : 'iphone');
  const [prompt, setPrompt] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const copy = () => navigator.clipboard?.writeText(APP_URL).then(() => setCopied(true)).catch(() => setCopied(false));

  const body = (
    <div className="install grid">
      {env.standalone && <div className="notice"><span className="pill ok">Installata</span><span>Stai già usando l'app MCC dalla schermata Home.</span></div>}
      {env.inApp && (
        <div className="notice"><span className="pill warn">Attenzione</span><span>Hai aperto il link dentro WhatsApp o un'altra app: apri il menu ⋯ e scegli <b>Apri nel browser</b> ({env.ios ? 'Safari' : 'Chrome'}), poi segui i passi qui sotto.</span></div>
      )}

      <div className="install-grid">
        <section className="card pad qr-card">
          <h3>Scansiona con la fotocamera</h3>
          <img src="/qr-installa.svg" alt="QR code per aprire l'app MCC" width="220" height="220" />
          <p className="small muted" style={{ margin: 0 }}>Inquadra il codice con la fotocamera del telefono: si apre questa pagina, poi aggiungi l'app alla Home.</p>
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            <code className="url">milano-city-championship.web.app<wbr />/installa</code>
            <button className="btn sm ghost" onClick={copy}>{copied ? 'Link copiato' : 'Copia link'}</button>
          </div>
        </section>

        <section className="card pad">
          <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
            <button role="tab" aria-selected={tab === 'iphone'} className={`tab ${tab === 'iphone' ? 'on' : ''}`} onClick={() => setTab('iphone')}>iPhone / iPad</button>
            <button role="tab" aria-selected={tab === 'android'} className={`tab ${tab === 'android' ? 'on' : ''}`} onClick={() => setTab('android')}>Android</button>
          </div>
          {tab === 'iphone' ? (
            <ol className="steps">
              <li><b>Apri il link in Safari.</b> Su iPhone l'installazione funziona solo da Safari{env.ios && !env.safari ? ': sei in un altro browser, copia il link e incollalo in Safari' : ''}.</li>
              <li>Tocca il pulsante <b>Condividi</b> <span className="kbd">⬆︎</span> in basso (su iPad in alto a destra).</li>
              <li>Scorri e scegli <b>Aggiungi alla schermata Home</b>.</li>
              <li>Lascia il nome <b>MCC</b> e tocca <b>Aggiungi</b>.</li>
              <li>Apri l'icona <b>MCC</b> dalla Home e accedi con Google: la prossima volta sei già dentro.</li>
            </ol>
          ) : (
            <>
              {prompt && <button className="btn" style={{ width: '100%', marginBottom: 12 }} onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>Installa MCC adesso</button>}
              <ol className="steps">
                <li><b>Apri il link in Chrome.</b></li>
                <li>Se compare il banner <b>Installa app</b> (o il pulsante qui sopra) toccalo.</li>
                <li>Altrimenti apri il menu <span className="kbd">⋮</span> in alto a destra e scegli <b>Installa app</b> (a volte <b>Aggiungi a schermata Home</b>).</li>
                <li>Conferma con <b>Installa</b>: l'icona <b>MCC</b> compare nella Home e tra le app.</li>
                <li>Apri MCC e accedi con Google.</li>
              </ol>
            </>
          )}
          <p className="small muted" style={{ marginBottom: 0 }}>Non serve nessuno store: l'app si aggiorna da sola ogni volta che la apri.</p>
        </section>
      </div>
    </div>
  );

  if (embedded) return <div className="grid"><h2>Installa l'app</h2>{body}</div>;
  return (
    <div className="lp">
      <nav className="lp-nav"><div className="wrap lp-nav-in"><Link to="/" className="brand"><img src="/brand/mcc-logo-240.webp" alt="" className="brandmark" /> <span>MCC</span></Link><Link to="/login" className="btn sm">Accedi</Link></div></nav>
      <main className="wrap section" style={{ display: 'grid', gap: 18 }}>
        <div><div className="kicker">Milano City Championship</div><h2>Installa l'app sul telefono</h2></div>
        {body}
      </main>
    </div>
  );
}
