// Regolamento ufficiale completo (testo integrale, modificabile dal Commissioner) con indice e link agli articoli
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Spinner } from '../components/ui';

export function useRules() {
  const [rules, setRules] = useState(undefined);
  useEffect(() => onSnapshot(doc(db, 'league', 'rules'), (s) => setRules(s.data() || null), () => setRules(null)), []);
  return rules;
}

// Testo semplice -> blocchi: paragrafi, elenchi (•, -, "1° Classificato"), tabelle con righe "| a | b |"
function Body({ text }) {
  const blocks = String(text || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(<ul key={`l${out.length}`}>{list.map((li, i) => <li key={i}>{li}</li>)}</ul>); list = null; } };
  blocks.forEach((b, i) => {
    if (b.startsWith('|')) {
      flush();
      const rows = b.split('\n').map((r) => r.split('|').slice(1, -1).map((c) => c.trim()));
      out.push(
        <div key={i} className="table-wrap rules-table"><table>
          <thead><tr>{rows[0].map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className={j ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      return;
    }
    const bullet = b.match(/^(?:[•-]\s*)(.*)$/s);
    if (bullet || /^\d+°\s+Classificato/.test(b)) { (list ||= []).push(bullet ? bullet[1] : b); return; }
    flush();
    if (/^(Es\.|Esempio)/i.test(b)) out.push(<p key={i} className="rules-ex">{b}</p>);
    else out.push(<p key={i}>{b}</p>);
  });
  flush();
  return <>{out}</>;
}

export default function Rules({ embedded = false }) {
  const rules = useRules();
  const [q, setQ] = useState('');
  const sections = rules?.sections || [];
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return qq ? sections.filter((s) => `${s.num} ${s.title} ${s.body}`.toLowerCase().includes(qq)) : sections;
  }, [sections, q]);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && sections.length) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [sections.length]);

  const content = rules === undefined ? <Spinner /> : !sections.length ? <p className="muted">Regolamento non disponibile.</p> : (
    <div className="rules">
      <aside className="rules-toc" aria-label="Indice del regolamento">
        <input id="rules-search" type="search" placeholder="Cerca nel regolamento (es. tagli, rookie)" value={q} onChange={(e) => setQ(e.target.value)} />
        <nav>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={s.num.includes('.') ? 'sub' : ''}
              onClick={(e) => { e.preventDefault(); setQ(''); setTimeout(() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); history.replaceState(null, '', `#${s.id}`); }}>
              <span className="n">{s.num}</span>{s.title}
            </a>
          ))}
        </nav>
      </aside>
      <div className="rules-body">
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className={`rules-art ${s.num.includes('.') ? 'sub' : ''}`}>
            {s.num.includes('.') ? <h3><span className="n">{s.num}</span> {s.title}</h3> : <h2><span className="n">{s.num}</span> {s.title}</h2>}
            <Body text={s.body} />
          </section>
        ))}
        {!filtered.length && <p className="muted">Nessun articolo contiene “{q}”.</p>}
        <p className="small muted">Testo ufficiale del Regolamento Milano City Championship{rules?.updatedAt?.toDate ? ` · aggiornato il ${rules.updatedAt.toDate().toLocaleDateString('it-IT')}` : ''}. In caso di dubbi decide il Commissioner (art. 6.2).</p>
      </div>
    </div>
  );

  if (embedded) return <div className="grid"><h2>Regolamento ufficiale</h2>{content}</div>;
  return (
    <div className="lp">
      <nav className="lp-nav"><div className="wrap lp-nav-in"><Link to="/" className="brand"><img src="/brand/mcc-logo-240.webp" alt="" className="brandmark" /> <span>MCC</span></Link><Link to="/" className="btn sm ghost" style={{ color: '#fff' }}>← Sito</Link></div></nav>
      <main className="wrap section" style={{ display: 'grid', gap: 18 }}>
        <div><div className="kicker">Milano City Championship</div><h2>Regolamento ufficiale</h2></div>
        {content}
      </main>
    </div>
  );
}
