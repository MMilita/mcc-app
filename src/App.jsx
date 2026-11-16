import { Navigate, NavLink, Outlet, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useData } from './lib/data';
import { FranchiseLogo, Icon, Spinner } from './components/ui';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Home from './pages/Home';
import Lineup from './pages/Lineup';
import Players from './pages/Players';
import League from './pages/League';
import Franchise from './pages/Franchise';
import More from './pages/More';
import Admin from './pages/Admin';
import Install from './pages/Install';
import Rules from './pages/Rules';
import History from './pages/History';

const NAV = [
  { to: '/app', label: 'Home', icon: Icon.home, end: true },
  { to: '/app/formazione', label: 'Formazione', icon: Icon.court },
  { to: '/app/giocatori', label: 'Giocatori', icon: Icon.players },
  { to: '/app/lega', label: 'Lega', icon: Icon.trophy },
  { to: '/app/altro', label: 'Altro', icon: Icon.more },
];

function RequireAuth({ children }) {
  const { user } = useData();
  if (user === undefined) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Shell() {
  const { user, isAdmin, profile, franchiseById } = useData();
  const team = franchiseById[profile?.franchiseId];
  const loc = useLocation();
  return (
    <div className="shell">
      <aside className="side-nav">
        <Link to="/" className="brand"><img src="/brand/mcc-logo-240.webp" alt="" className="brandmark" /> MCC</Link>
        {NAV.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} className="nav"><I />{label}</NavLink>
        ))}
        <NavLink to="/app/installa" className="nav"><Icon.phone />Installa app</NavLink>
        {isAdmin && <NavLink to="/admin" className="nav"><Icon.shield />Commissioner</NavLink>}
        <div style={{ marginTop: 'auto' }} className="small muted tcell">{team && <FranchiseLogo f={team} size={28} />}{team ? team.name : 'Nessuna franchigia assegnata'}</div>
      </aside>
      <div>
        <header className="topbar">
          <Link to="/" className="brand brand-mobile" style={{ color: 'inherit' }}><img src="/brand/mcc-logo-240.webp" alt="" className="brandmark" /> MCC</Link>
          <span className="tcell small" style={{ opacity: 0.9 }}>{team && <FranchiseLogo f={team} size={26} />}{team?.name || 'Milano City Championship'}</span>
          <div className="who">
            {isAdmin && <Link to="/admin" className="pill" style={{ color: '#fff', background: 'var(--cross)', border: 0, textDecoration: 'none' }}>Admin</Link>}
            {user?.photoURL ? <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
          </div>
        </header>
        <main className="main"><div key={loc.pathname} className="page-in"><Outlet /></div></main>
      </div>
      <nav className="bottom-nav" aria-label="Navigazione principale">
        {NAV.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end}><I />{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}

function RequireAdmin({ children }) {
  const { isAdmin, user } = useData();
  if (user === undefined) return <Spinner />;
  if (!isAdmin) return <div className="wrap section"><h2>Accesso riservato</h2><p className="muted">Quest'area è solo per il Commissioner.</p><Link className="btn" to="/app">Torna all'app</Link></div>;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<div className="page-in"><Landing /></div>} />
      <Route path="/login" element={<Login />} />
      <Route path="/installa" element={<Install />} />
      <Route path="/regolamento" element={<Rules />} />
      <Route path="/storico" element={<History />} />
      <Route path="/app" element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="formazione" element={<Lineup />} />
        <Route path="formazione/:fid" element={<Lineup />} />
        <Route path="giocatori" element={<Players />} />
        <Route path="lega" element={<League />} />
        <Route path="franchigia/:fid" element={<Franchise />} />
        <Route path="altro" element={<More />} />
        <Route path="installa" element={<Install embedded />} />
        <Route path="regolamento" element={<Rules embedded />} />
        <Route path="storico" element={<History embedded />} />
      </Route>
      <Route path="/admin" element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<RequireAdmin><Admin /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
