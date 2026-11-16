import { test, expect } from '@playwright/test';
import { noHorizontalScroll, snap, trackErrors } from './helpers';

test.describe('Landing pubblica', () => {
  test('si carica con tabellone, classifica, 16 franchigie, premi e record', async ({ page }, ti) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Milano City Championship/i);
    // tabellone della giornata
    const board = page.locator('.board');
    await expect(board).toBeVisible();
    await expect(board.locator('.board-row')).toHaveCount(8); // 16 franchigie = 8 partite per giornata
    // classifica completa con loghi
    const rows = page.locator('table.standings tbody tr');
    await expect(rows).toHaveCount(16);
    await expect(rows.first().locator('.flogo')).toBeVisible();
    // franchigie: 16 card, 15 loghi immagine + 1 monogramma (Tolstoj, logo mancante)
    await expect(page.locator('.fcard')).toHaveCount(16);
    await expect(page.locator('.fcard img.flogo')).toHaveCount(16);
    const broken = await page.locator('img.flogo').evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.alt));
    expect(broken, 'loghi non caricati').toEqual([]);
    // albo d'oro
    await expect(page.locator('.champions li')).toHaveCount(7);
    await noHorizontalScroll(page);
    await snap(page, ti, 'landing');
    expect(errors).toEqual([]);
  });

  test('filtri premi e tab record funzionano', async ({ page }) => {
    await page.goto('/#premi');
    const premi = page.locator('#premi');
    await expect.poll(() => premi.locator('tbody tr').count()).toBeGreaterThan(40);
    const all = await premi.locator('tbody tr').count();
    expect(all).toBeGreaterThan(40);
    await premi.getByRole('tab', { name: 'MVP' }).click();
    const mvp = await premi.locator('tbody tr').count();
    expect(mvp).toBeGreaterThan(0);
    expect(mvp).toBeLessThan(all);
    await expect(premi.locator('tbody tr').first()).toContainText('MVP');
    const rec = page.locator('#record');
    await rec.getByRole('tab', { name: 'Finals' }).click();
    await expect(rec.getByRole('tab', { name: 'Finals' })).toHaveAttribute('aria-selected', 'true');
    await expect(rec.locator('tbody').first()).toContainText('Foppa Swords');
  });

  test('CTA: Accedi, Installa sul telefono', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Installa sul telefono' }).click();
    await expect(page).toHaveURL(/\/installa$/);
    await expect(page.getByAltText(/QR code/)).toBeVisible();
    await page.goto('/');
    await page.getByRole('link', { name: 'Entra nell\'app' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Accedi con Google' })).toBeVisible();
  });

  test('pagina Installa: QR, tab iPhone/Android, istruzioni', async ({ page }, ti) => {
    await page.goto('/installa');
    const qr = page.getByAltText(/QR code/);
    await expect(qr).toBeVisible();
    expect(await qr.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Android' }).click();
    await expect(page.getByText('Installa app', { exact: false }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'iPhone / iPad' }).click();
    await expect(page.getByText('Aggiungi alla schermata Home')).toBeVisible();
    await noHorizontalScroll(page);
    await snap(page, ti, 'installa');
  });

  test('Regolamento ufficiale completo: indice, articoli, ricerca', async ({ page }, ti) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Regolamento' }).first().click();
    await expect(page).toHaveURL(/\/regolamento$/);
    await expect(page.locator('.rules-art')).toHaveCount(23);
    await expect(page.locator('.rules-table')).toHaveCount(1);
    await page.locator('.rules-toc a').filter({ hasText: 'Injury List' }).click();
    await expect(page).toHaveURL(/#art-4-8$/);
    await page.fill('#rules-search', 'luxury tax');
    await expect(page.locator('.rules-art').first()).toContainText(/Luxury Tax/i);
    await noHorizontalScroll(page);
    await snap(page, ti, 'regolamento');
  });

  test('Storico: stagioni con campioni e premi', async ({ page }, ti) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Storico stagione per stagione/ }).click();
    await expect(page).toHaveURL(/\/storico$/);
    await expect(page.locator('.hs-card').first()).toBeVisible();
    await expect(page.locator('.hs-card').filter({ hasText: '2025/26' })).toContainText('Tolstoj Bum Boomers');
    await expect(page.locator('.hs-card').filter({ hasText: '2018/19' })).toContainText('Parabiago');
    await noHorizontalScroll(page);
    await snap(page, ti, 'storico');
  });

  test('rotta inesistente torna alla home', async ({ page }) => {
    await page.goto('/pagina-che-non-esiste');
    await expect(page).toHaveURL(/\/$/);
  });
});
