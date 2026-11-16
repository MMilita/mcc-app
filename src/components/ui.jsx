import { useEffect, useState } from 'react';
// Componenti grafici condivisi del brand MCC
// colori canotta: [corpo, bordini/scritte, numero]
export const NBA_COLORS = {
  ATL: ['#E03A3E', '#C1D32F', '#FFFFFF'], BOS: ['#007A33', '#FFFFFF', '#FFFFFF'], BKN: ['#111111', '#FFFFFF', '#FFFFFF'], CHA: ['#1D1160', '#00788C', '#FFFFFF'],
  CHI: ['#CE1141', '#111111', '#FFFFFF'], CLE: ['#860038', '#FDBB30', '#FFFFFF'], DAL: ['#00538C', '#B8C4CA', '#FFFFFF'], DEN: ['#0E2240', '#FEC524', '#FEC524'],
  DET: ['#C8102E', '#1D42BA', '#FFFFFF'], GSW: ['#1D428A', '#FFC72C', '#FFC72C'], HOU: ['#CE1141', '#C4CED4', '#FFFFFF'], IND: ['#002D62', '#FDBB30', '#FDBB30'],
  LAC: ['#C8102E', '#1D428A', '#FFFFFF'], LAL: ['#FDB927', '#552583', '#552583'], MEM: ['#5D76A9', '#12173F', '#FFFFFF'], MIA: ['#98002E', '#F9A01B', '#FFFFFF'],
  MIL: ['#00471B', '#EEE1C6', '#EEE1C6'], MIN: ['#0C2340', '#78BE20', '#FFFFFF'], NOP: ['#0C2340', '#C8102E', '#FFFFFF'], NYK: ['#006BB6', '#F58426', '#FFFFFF'],
  OKC: ['#007AC1', '#EF3B24', '#FFFFFF'], ORL: ['#0077C0', '#C4CED4', '#FFFFFF'], PHI: ['#006BB6', '#ED174C', '#FFFFFF'], PHX: ['#1D1160', '#E56020', '#FFFFFF'],
  POR: ['#E03A3E', '#111111', '#FFFFFF'], SAC: ['#5A2D81', '#63727A', '#FFFFFF'], SAS: ['#111111', '#C4CED4', '#FFFFFF'], TOR: ['#CE1141', '#111111', '#FFFFFF'],
  UTA: ['#002B5C', '#F9A01B', '#FFFFFF'], WAS: ['#002B5C', '#E31837', '#FFFFFF'],
};

let jerseyUid = 0;
// Canotta da basket disegnata in SVG (forma, bordini, sigla squadra ad arco, numero)
export function Jersey({ team, number = '', className = 'jersey' }) {
  const [body, trim, numc] = NBA_COLORS[team] || ['#24304d', '#d00000', '#ffffff'];
  const id = `j${(jerseyUid += 1)}`;
  const outline = 'M31 3 H41 C43 15 57 15 59 3 H69 C70 14 75 24 88 28 V104 C70 108 30 108 12 104 V28 C25 24 30 14 31 3 Z';
  const n = String(number || '');
  return (
    <svg className={className} viewBox="0 0 100 110" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".28" />
          <stop offset=".22" stopColor="#fff" stopOpacity=".10" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".78" stopColor="#fff" stopOpacity=".06" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
        <path id={`${id}a`} d="M24 47 Q50 33 76 47" />
      </defs>
      <path d={outline} fill={body} />
      {/* bande laterali */}
      <path d="M12 40 V104 C14 104.5 16 105 18 105.3 V44 Z" fill={trim} opacity=".9" />
      <path d="M88 40 V104 C86 104.5 84 105 82 105.3 V44 Z" fill={trim} opacity=".9" />
      {/* bordini collo e giromanica */}
      <path d="M41 3 C43 15 57 15 59 3" fill="none" stroke={trim} strokeWidth="4" />
      <path d="M31 3 C30 14 25 24 12 28" fill="none" stroke={trim} strokeWidth="4" />
      <path d="M69 3 C70 14 75 24 88 28" fill="none" stroke={trim} strokeWidth="4" />
      <path d={outline} fill={`url(#${id}s)`} />
      <text fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif" fontWeight="700" fontSize="12.5" letterSpacing="1" fill={trim} textAnchor="middle">
        <textPath href={`#${id}a`} startOffset="50%">{team || ''}</textPath>
      </text>
      {n && (
        <text x="50" y={n.length > 1 ? 86 : 87} textAnchor="middle" fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif" fontWeight="700"
          fontSize={n.length > 1 ? 38 : 42} fill={numc} stroke={trim === numc ? body : trim} strokeWidth="1.6" paintOrder="stroke">{n}</text>
      )}
      <path d={outline} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.2" />
    </svg>
  );
}

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const Icon = {
  home: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  court: () => <svg viewBox="0 0 24 24" {...P}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 3v5a4 4 0 0 0 8 0V3M3 21h18" /></svg>,
  players: () => <svg viewBox="0 0 24 24" {...P}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>,
  trophy: () => <svg viewBox="0 0 24 24" {...P}><path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 14v4M8 21h8M9 18h6" /></svg>,
  more: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>,
  shield: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  undo: () => <svg viewBox="0 0 24 24" {...P}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>,
  swap: () => <svg viewBox="0 0 24 24" {...P}><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>,
  share: () => <svg viewBox="0 0 24 24" {...P}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>,
  help: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" /></svg>,
  search: () => <svg viewBox="0 0 24 24" {...P}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  x: () => <svg viewBox="0 0 24 24" {...P}><path d="M18 6L6 18M6 6l12 12" /></svg>,
  phone: () => <svg viewBox="0 0 24 24" {...P}><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>,
  trash: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></svg>,
};

export function RoleTag({ role }) {
  return <span className={`tag-role ${role}`}>{role}</span>;
}

export function Spinner({ label = 'Caricamento', delay = 400 }) {
  // il logo che pulsa compare solo se l'attesa è lunga (niente lampeggi nei cambi pagina veloci)
  const [show, setShow] = useState(delay === 0);
  useEffect(() => { if (delay === 0) return undefined; const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div className="loader" role="status" aria-label={label}>
      {show && <img src="/brand/mcc-logo-240.webp" alt="" width="64" height="78" />}
    </div>
  );
}

export function BrandMark({ size = 30 }) {
  return <img className="brandmark" src="/brand/mcc-logo-240.webp" alt="" style={{ height: size, width: 'auto' }} />;
}

export function Sheet({ onClose, children }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        {children}
      </div>
    </>
  );
}

// colore di striscia per le franchigie dai "colori sociali"
const COLOR_WORDS = {
  giallo: '#F2A900', rosso: '#D4202C', blu: '#1D428A', nero: '#111', bianco: '#ddd', verde: '#1f8a4c', rosa: '#E87EA1',
  turchese: '#1BB3B3', arancione: '#F07F1A', arancio: '#F07F1A', oro: '#C9A227', porpora: '#7A1F3D', acqua: '#3CC',
};
export function FranchiseLogo({ f, size = 40, className = '' }) {
  if (!f) return null;
  if (f.logo) return <img className={`flogo ${className}`} src={f.logo} alt={`Logo ${f.name}`} width={size} height={size} loading="lazy" style={{ width: size, height: size }} />;
  const [a, b] = franchiseColors(f.colors);
  const initials = f.name.split(' ').filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
  return (
    <span className={`flogo mono ${className}`} style={{ width: size, height: size, background: a, color: b === '#ddd' ? '#111' : b, fontSize: size * 0.38 }} aria-label={`Logo ${f.name}`}>
      {initials}
    </span>
  );
}

// zona del Municipio come i simboli rotondi della metro milanese
export function ZoneBadge({ zona }) {
  const n = String(zona || '').match(/\d+/)?.[0];
  if (!n) return null;
  return <span className="zone" title={`Municipio ${n}`}>{n}</span>;
}

export function franchiseColors(colors = '') {
  const words = String(colors || '').toLowerCase().split(/[,\s]+/);
  const found = words.map((w) => COLOR_WORDS[w]).filter(Boolean);
  return found.length ? found : ['#24304d', '#f2a900'];
}
