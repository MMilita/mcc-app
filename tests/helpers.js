import { expect } from '@playwright/test';

export const PROD = 'https://milano-city-championship.web.app';

// GM simulato (solo dev server): Capecelatro Red Lights, con permessi da Commissioner
export async function loginAsGM(page, { admin = true, fid = 'capecelatro-red-lights' } = {}) {
  await page.addInitScript(([a, f]) => {
    localStorage.setItem('mcc-e2e', '1');
    localStorage.setItem('mcc-e2e-fid', f);
    if (a) localStorage.setItem('mcc-e2e-admin', '1'); else localStorage.removeItem('mcc-e2e-admin');
  }, [admin, fid]);
}

export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // rumore atteso: permessi Firestore per collezioni riservate in modalità test, font offline
    if (/permission|Missing or insufficient|fonts\.g|ERR_|favicon/i.test(t)) return;
    errors.push(`console: ${t}`);
  });
  return errors;
}

export async function noHorizontalScroll(page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, `pagina più larga dello schermo (${sw} > ${cw})`).toBeLessThanOrEqual(cw + 1);
}

export async function snap(page, testInfo, name) {
  await page.screenshot({ path: `test-screens/${testInfo.project.name}-${name}.png`, fullPage: true });
}

export const isMobile = (testInfo) => ['android', 'iphone'].includes(testInfo.project.name);
