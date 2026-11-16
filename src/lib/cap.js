// Regole economiche dal Regolamento MCC (par. 3, 3.1, 4.4)
export const SEASON_KEY = '2026/2027';
export const CAP = 120;
export const APRON = 150;
export const FLOOR = 96;
const PREV = { '2025/2026': '2024/2025', '2024/2025': '2023/2024', '2026/2027': '2025/2026', '2027/2028': '2026/2027', '2028/2029': '2027/2028', '2029/2030': '2028/2029' };

const r1 = (x) => Math.round(x * 10) / 10;
// taglio: pesa il 50% dello stipendio, arrotondato per difetto alla prima cifra decimale
export const cutWeight = (salary) => Math.floor((salary * 0.5 + 1e-9) * 10) / 10;

export function salaryOf(contract, season = SEASON_KEY) {
  return contract?.salaries?.[season] ?? 0;
}

export function capSummary(franchise, season = SEASON_KEY) {
  const active = (franchise?.roster || []).filter((p) => salaryOf(p, season) > 0);
  const activeTotal = active.reduce((s, p) => s + salaryOf(p, season), 0);
  const cutTotal = (franchise?.cut || []).reduce((s, p) => s + cutWeight(salaryOf(p, season)), 0);
  // Injury List: lo stipendio salvato è già ridotto al 10% (recupero del 90%)
  const ilTotal = (franchise?.injured || []).reduce((s, p) => s + salaryOf(p, season), 0);
  const raw = r1(activeTotal + cutTotal + ilTotal);
  // Regolamento 3.1: se al termine del FantaDraft il monte stipendi superava il cap,
  // quella cifra è il minimo conteggiato a fine stagione (non si può scendere sotto)
  const draftTotal = franchise?.draftTotals?.[season] ?? null;
  const draftFloor = draftTotal != null && draftTotal > CAP ? draftTotal : null;
  const total = draftFloor != null ? Math.max(raw, draftFloor) : raw;
  const over = r1(Math.max(0, total - CAP));
  // luxury tax: 1 € per milione oltre il cap, 2 € se sforato anche la stagione precedente
  const prevSeason = PREV[season];
  const prevTotal = prevSeason ? (franchise?.capTotals?.[prevSeason] ?? null) : null;
  const secondYear = prevTotal != null && prevTotal > CAP;
  const taxRate = secondYear ? 2 : 1;
  const prev2 = prevSeason ? PREV[prevSeason] : null;
  const prev2Total = prev2 ? (franchise?.capTotals?.[prev2] ?? null) : null;
  const thirdYearRisk = secondYear && prev2Total != null && prev2Total > CAP; // vietato il 3° anno consecutivo (art. 3.1)
  return {
    total,
    rawTotal: raw,
    draftTotal,
    draftFloor,
    taxRate,
    taxEuro: r1(over * taxRate),
    secondYear,
    thirdYearRisk,
    activeTotal: r1(activeTotal),
    cutTotal: r1(cutTotal),
    ilTotal: r1(ilTotal),
    space: r1(CAP - total),
    apronSpace: r1(APRON - total),
    over,
    players: active.length,
    status: total > APRON ? 'apron' : total > CAP ? 'tax' : total < FLOOR ? 'floor' : 'ok',
  };
}

export function roleCounts(roster = []) {
  return roster.reduce((acc, p) => ({ ...acc, [p.role]: (acc[p.role] || 0) + 1 }), {});
}

// Normalizzazione nomi per collegare contratti (Excel) e giocatori Dunkest
export function normName(s = '') {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Varianti di grafia usate nei fogli della lega
const ALIASES = { 'jacob poeltl': 'jakob poeltl', 'maxime rainaud': 'maxime raynaud', 'alexandre sarr': 'alex sarr', 'paskal siakam': 'pascal siakam' };
export const keyOf = (name) => {
  const n = normName(name);
  return ALIASES[n] || n;
};
