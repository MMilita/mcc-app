import { test, expect } from '@playwright/test';
import { PROD } from './helpers';

// Test PWA sul sito pubblicato (service worker e manifest esistono solo nella build di produzione)
test.describe('PWA installabile (sito pubblicato)', () => {
  test('manifest completo e icone raggiungibili', async ({ request }) => {
    const res = await request.get(`${PROD}/manifest.webmanifest`);
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.name).toBe('Milano City Championship');
    expect(m.short_name).toBe('MCC');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/app');
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBeTruthy();
    for (const i of m.icons) expect((await request.get(`${PROD}${i.src}`)).ok(), i.src).toBeTruthy();
    expect((await request.get(`${PROD}/icons/apple-touch-icon.png`)).ok()).toBeTruthy();
    expect((await request.get(`${PROD}/qr-installa.svg`)).ok()).toBeTruthy();
  });

  test('meta tag per iPhone (schermata Home)', async ({ page }) => {
    await page.goto(PROD);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  });

  test('service worker attivo e app apribile offline', async ({ page, context }, ti) => {
    test.skip(!['desktop', 'android'].includes(ti.project.name), 'service worker controllato su Chromium');
    await page.goto(`${PROD}/app`);
    await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 20_000 });
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
    await context.setOffline(true);
    await page.reload();
    // offline: la shell dell'app si apre comunque (login o app)
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByText(/MCC|Accedi con Google/).first()).toBeVisible();
    await context.setOffline(false);
  });

  test('rotte profonde servite dall\'hosting (refresh su /app/formazione)', async ({ request }) => {
    for (const p of ['/app/formazione', '/installa', '/admin', '/app/lega']) {
      const r = await request.get(`${PROD}${p}`);
      expect(r.status(), p).toBe(200);
    }
  });
});
