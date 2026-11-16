import { test, expect } from '@playwright/test';
import { isMobile, loginAsGM, noHorizontalScroll, snap, trackErrors } from './helpers';

test.describe('App GM (modalità E2E)', () => {
  test.beforeEach(async ({ page }) => { await loginAsGM(page); });

  test('senza login l\'app rimanda al login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto('/app');
    await expect(p).toHaveURL(/\/login$/);
    await ctx.close();
  });

  test('Home: squadra, partita, salary cap e rosa', async ({ page }, ti) => {
    const errors = trackErrors(page);
    await page.goto('/app');
    await expect(page.locator('.team-hero h2')).toHaveText('Capecelatro Red Lights');
    await expect(page.locator('.team-hero .flogo')).toBeVisible();
    await expect(page.getByText('Salary cap 26/27')).toBeVisible();
    await expect(page.getByText('120,9').first()).toBeVisible();
    await expect(page.locator('table tbody tr').filter({ hasText: 'Rudy Gobert' })).toBeVisible();
    // navigazione: barra in basso su telefono, laterale su desktop
    if (isMobile(ti)) await expect(page.locator('.bottom-nav')).toBeVisible();
    if (ti.project.name === 'desktop') await expect(page.locator('.side-nav')).toBeVisible();
    await noHorizontalScroll(page);
    await snap(page, ti, 'app-home');
    expect(errors).toEqual([]);
  });

  test('navigazione principale tra le sezioni', async ({ page }, ti) => {
    await page.goto('/app');
    const nav = ti.project.name === 'desktop' ? page.locator('.side-nav') : page.locator('.bottom-nav');
    for (const [label, url, check] of [
      ['Formazione', /formazione/, '.court'],
      ['Giocatori', /giocatori/, '.plist'],
      ['Lega', /lega/, 'table'],
      ['Altro', /altro/, 'text=Regolamento in breve'],
      ['Home', /\/app$/, '.team-hero'],
    ]) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(url);
      await expect(page.locator(check).first()).toBeVisible();
    }
  });

  test('i tasti della barra in basso sono grandi abbastanza per il pollice', async ({ page }, ti) => {
    test.skip(!isMobile(ti), 'solo telefono');
    await page.goto('/app');
    const boxes = await page.locator('.bottom-nav a').evaluateAll((as) => as.map((a) => a.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })));
    for (const b of boxes) { expect(b.h).toBeGreaterThanOrEqual(44); expect(b.w).toBeGreaterThanOrEqual(44); }
  });

  test('Formazione: campo, capitano, scheda giocatore, sostituzione, salva', async ({ page }, ti) => {
    const errors = trackErrors(page);
    await page.goto('/app/formazione');
    await expect(page.locator('.court')).toBeVisible();
    await expect(page.locator('.slots .pcard:not(.empty)')).toHaveCount(5);
    await expect(page.locator('.cbadge')).toHaveCount(1);
    await expect(page.locator('.lu-head')).toContainText('GIORNATA');
    await snap(page, ti, 'formazione');
    // scheda giocatore
    await page.locator('.slots .pcard').first().click();
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Capitano/ })).toBeVisible();
    await snap(page, ti, 'formazione-scheda');
    // modalità sostituzione e annullamento
    await sheet.getByRole('button', { name: /Sostituisci/ }).click();
    await expect(page.locator('.sub-bar')).toBeVisible();
    await page.locator('.sub-bar').click();
    await expect(page.locator('.toast')).toContainText('Sostituzione annullata');
    // salva (in modalità test resta nel browser)
    const save = page.getByRole('button', { name: 'Salva' });
    await save.click();
    await expect(page.locator('.toast')).toContainText(/salvata|Scegli il capitano|Quintetto/);
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('Formazione: non si salva con la panchina incompleta', async ({ page }) => {
    await page.goto('/app/formazione');
    await page.locator('.lu [data-slot="B3"]').click();
    await page.locator('.sheet').getByRole('button', { name: /Tribuna/ }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.locator('.toast')).toContainText('Completa la panchina');
  });

  test('Formazione: drag & drop scambia due giocatori (mouse)', async ({ page }, ti) => {
    test.skip(ti.project.name !== 'desktop', 'trascinamento con mouse solo su desktop');
    await page.goto('/app/formazione');
    const benchCard = page.locator('.lu [data-slot="B0"]');
    const sixth = page.locator('.lu [data-slot="X"]');
    await benchCard.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(200);
    const benchName = await benchCard.locator('.name').innerText();
    const sixthName = await sixth.locator('.name').innerText();
    const a = await benchCard.boundingBox(); const b = await sixth.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + 20);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y + 40, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 15 });
    await expect(page.locator('.drag-ghost')).toBeVisible();
    await page.mouse.up();
    // o lo scambio è avvenuto, o è stato rifiutato con un messaggio chiaro (giocatore già sceso in campo)
    const toast = page.locator('.toast');
    const swapped = (await page.locator('.lu [data-slot="X"] .name').innerText()) === benchName;
    if (!swapped) await expect(toast).toContainText(/già giocato|Modulo/);
    else await expect(page.locator('.lu [data-slot="B0"] .name')).toHaveText(sixthName);
  });

  test('Formazione: pannello Rosa e Calendario', async ({ page }) => {
    await page.goto('/app/formazione');
    await expect(page.locator('.lu-panel .prow').first()).toBeVisible();
    await page.locator('.lu-panel').getByRole('button', { name: /Calendario/ }).click();
    await expect(page.locator('.lu-panel').getByText(/Turno 1/)).toBeVisible();
  });

  test('Formazione di un\'altra squadra in sola lettura', async ({ page }) => {
    await loginAsGM(page, { admin: false });
    await page.goto('/app/formazione/baggio-stabbers');
    await expect(page.getByText('Sola lettura')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salva' })).toHaveCount(0);
  });

  test('Giocatori: ricerca, filtri, scheda e messaggio d\'asta', async ({ page, context }, ti) => {
    if (ti.project.name === 'desktop' || ti.project.name === 'android') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/app/giocatori');
    await expect(page.locator('.prow').first()).toBeVisible();
    await page.getByRole('button', { name: 'C', exact: true }).click();
    await page.getByPlaceholder(/Cerca giocatore/).fill('Missi');
    await expect(page.locator('.prow')).toHaveCount(1);
    await page.locator('.prow').first().click();
    const sheet = page.locator('.sheet');
    await expect(sheet).toContainText('Missi');
    await expect(sheet).toContainText('Capecelatro Red Lights interessati a Yves Missi NOP C');
    await expect(sheet).toContainText('Prossime partite');
    await expect(sheet.locator('.pd-chart svg')).toBeVisible();
    await snap(page, ti, 'giocatori-scheda');
    await sheet.getByRole('tab', { name: 'Partite' }).click();
    await expect(sheet.locator('.pd-games tbody tr').first()).toBeVisible();
    await snap(page, ti, 'giocatori-partite');
  });

  test('Lega: classifica, salary cap, premi, record', async ({ page }, ti) => {
    await page.goto('/app/lega');
    await expect(page.locator('tbody tr')).toHaveCount(16);
    await page.getByRole('button', { name: 'Salary cap' }).click();
    await expect(page.locator('tbody tr').filter({ hasText: 'Capecelatro' })).toContainText('120,9');
    await page.getByRole('button', { name: 'Premi' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.getByRole('button', { name: 'Record' }).click();
    await expect(page.getByText('Regular Season').first()).toBeVisible();
    await noHorizontalScroll(page);
    await snap(page, ti, 'lega');
  });

  test('Franchigia: contratti per stagione', async ({ page }, ti) => {
    await page.goto('/app/franchigia/capecelatro-red-lights');
    await expect(page.locator('.team-hero h2')).toHaveText('Capecelatro Red Lights');
    await expect(page.getByRole('heading', { name: 'Contratti' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'Carter Bryant' })).toBeVisible();
    await snap(page, ti, 'franchigia');
  });

  test('Partite H2H: giocate, prossime e dettaglio con formazioni', async ({ page }, ti) => {
    await page.goto('/app/franchigia/capecelatro-red-lights');
    await expect(page.locator('button.tm-row').first()).toBeVisible();
    await expect(page.getByText('BILANCIO')).toBeVisible();
    await page.locator('button.tm-row').first().click();
    const sheet = page.locator('.sheet');
    await expect(sheet.getByRole('heading', { name: 'Titolari' })).toBeVisible();
    await expect(sheet.locator('.md-row')).not.toHaveCount(0);
    await snap(page, ti, 'partita-dettaglio');
    await sheet.getByRole('button', { name: 'Chiudi' }).click();
    await page.getByRole('tab', { name: 'Prossime' }).click();
    await expect(page.locator('.tm-res.next').first()).toBeVisible();
  });

  test('Lega: calendario per giornata', async ({ page }) => {
    await page.goto('/app/lega');
    await page.getByRole('button', { name: 'Calendario' }).click();
    await expect(page.locator('.cal-row')).toHaveCount(8);
    await page.getByRole('button', { name: 'Giornata successiva' }).click();
    await expect(page.locator('.cal-row')).toHaveCount(8);
  });

  test('Lega: tornei (In-Season, Play-In, Playoff, Playout)', async ({ page }, ti) => {
    await page.goto('/app/lega');
    await page.getByRole('button', { name: 'Tornei' }).click();
    await expect(page.getByRole('tab', { name: 'In-Season Tournament' })).toBeVisible();
    await expect(page.locator('.tg-pots .card')).toHaveCount(4);
    await page.getByRole('tab', { name: 'Play-In' }).click();
    await expect(page.locator('.tg-card')).toHaveCount(3);
    await page.getByRole('tab', { name: 'Playoff' }).click();
    await expect(page.locator('.tg-bracket .tg-card')).toHaveCount(12);
    await snap(page, ti, 'tornei-playoff');
    await page.getByRole('tab', { name: 'Playout' }).click();
    await expect(page.locator('.tg-bracket .tg-card')).toHaveCount(12);
    await noHorizontalScroll(page);
  });

  test('Altro: tema scuro e pagina Installa', async ({ page }, ti) => {
    await page.goto('/app/altro');
    await page.getByRole('button', { name: 'Scuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await snap(page, ti, 'altro-scuro');
    await page.getByRole('link', { name: /Installa l'app/ }).click();
    await expect(page).toHaveURL(/\/app\/installa$/);
    await expect(page.getByAltText(/QR code/)).toBeVisible();
  });

  test('Commissioner: dashboard e sezioni', async ({ page }, ti) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /Dashboard Commissioner/i })).toBeVisible();
    for (const t of ['Landing & giornata', 'Classifica', 'Rose & contratti', 'Formazioni', 'Dati Dunkest', 'Utenti']) {
      await page.getByRole('button', { name: t, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Rose & contratti', exact: true }).click();
    await expect(page.getByText('Firma free agent')).toBeVisible();
    await noHorizontalScroll(page);
    await snap(page, ti, 'admin');
  });

  test('Commissioner: elimina / Injury List chiedono conferma e si annullano', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Rose & contratti', exact: true }).click();
    await page.getByLabel('Franchigia').selectOption('capecelatro-red-lights');
    const row = page.locator('tr').filter({ hasText: 'Nikola Vucevic' });
    await row.getByRole('button', { name: 'Elimina' }).click();
    await expect(page.getByText(/Eliminare Nikola Vucevic dalla rosa/)).toBeVisible();
    await page.getByRole('button', { name: 'Annulla' }).click();
    await expect(page.getByText(/Eliminare Nikola Vucevic/)).toHaveCount(0);
    await row.getByRole('button', { name: 'Injury List' }).click();
    await expect(page.getByText(/recupera il 90%/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conferma: Injury List' })).toBeVisible();
    await page.getByRole('button', { name: 'Annulla' }).click();
    await expect(page.getByText('Dati societari, palmarès e premi')).toBeVisible();
    await page.getByRole('button', { name: 'Albo & record', exact: true }).click();
    const first = page.getByLabel("Albo d'oro (campioni) Squadra riga 1");
    await first.click(); await first.press('End'); await first.type('X');
    await expect(first).toBeFocused();
  });

  test('Commissioner bloccato per chi non è admin', async ({ page }) => {
    await loginAsGM(page, { admin: false });
    await page.goto('/admin');
    await expect(page.getByText('Accesso riservato')).toBeVisible();
  });
});
