import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useData } from '../lib/data';

export default function Login() {
  const { user, signIn } = useData();
  const [err, setErr] = useState(null);
  if (user) return <Navigate to="/app" replace />;
  return (
    <div className="hero" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 420, textAlign: 'center' }}>
        <img src="/brand/mcc-logo-640.webp" alt="Milano City Championship" width="132" height="161" className="beat" style={{ height: 161, width: 'auto' }} />
        <h1 style={{ fontSize: 34, marginTop: 18 }}>Benvenuto nel <em>MCC</em></h1>
        <p>Accedi con Google per gestire la tua franchigia: formazione, rosa, contratti e mercato.</p>
        <button className="btn" style={{ width: '100%' }} onClick={() => signIn().catch((e) => setErr(e.message))}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6a24 24 0 0 0 0 21.4z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z" /></svg>
          Accedi con Google
        </button>
        {err && <p className="small" style={{ color: 'var(--tram-2)' }}>{err}</p>}
        <p className="small" style={{ opacity: 0.7 }}>Dopo il primo accesso il Commissioner collega il tuo account alla tua franchigia.</p>
        <Link to="/" className="small" style={{ opacity: 0.8 }}>← Torna al sito</Link>
      </div>
    </div>
  );
}
