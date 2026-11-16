import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DataProvider } from './lib/data';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';

try {
  const t = localStorage.getItem('mcc-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch { /* storage non disponibile */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DataProvider>
        <App />
      </DataProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

const t0 = performance.now();
requestAnimationFrame(() => {
  const el = document.getElementById('splash');
  if (!el) return; // già mostrata in questa sessione
  const wait = Math.max(0, 700 - (performance.now() - t0) - (performance.timeOrigin ? 0 : 0));
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 500); }, wait);
});

// Aggiornamenti automatici della PWA: appena esce una versione nuova la app si ricarica da sola,
// e controlla aggiornamenti ogni 30 minuti (utile con l'app installata e lasciata aperta).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (reg) setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  },
});
