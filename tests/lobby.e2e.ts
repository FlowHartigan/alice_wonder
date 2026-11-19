import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { expect, firefox, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { makeServer } from '../apps/server/src/server.ts';

const previewTitle = 'Aperçu du plateau — lecture seule';
const teaSummary = 'Table du Thé : 11 chaises ouvertes. Chaises 4J et 5J bloquées. Aucune carte n’est installée.';

async function checkBoard(player: Page) {
  const preview = player.getByRole('region', { name: previewTitle });
  const image = preview.getByRole('img', { name: /Plateau central officiel en français/ });
  await expect(preview.getByText(teaSummary, { exact: true })).toBeVisible();
  await expect(image).toHaveAccessibleDescription(teaSummary);
  await expect(image).toHaveAttribute('src', /plateau-principal-fr.*\.webp$/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    [element.complete, element.naturalWidth, element.naturalHeight])).toEqual([true, 2400, 1637]);
  const imageBox = await image.boundingBox();
  if (!imageBox) throw new Error('Plateau non visible');
  expect(imageBox.width / imageBox.height).toBeCloseTo(2400 / 1637, 2);
  expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(player.viewportSize()!.width);

  const badges = preview.locator('.board-blocker');
  await expect(badges).toHaveText(['4J', '5J']);
  for (const [index, x] of [0.554, 0.631].entries()) {
    const badge = badges.nth(index);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCSS('pointer-events', 'none');
    const box = await badge.boundingBox();
    if (!box) throw new Error('Bloqueur non visible');
    expect((box.x + box.width / 2 - imageBox.x) / imageBox.width).toBeCloseTo(x, 3);
    expect((box.y + box.height / 2 - imageBox.y) / imageBox.height).toBeCloseTo(0.241, 3);
  }
  await expect(preview.locator('a, button, input, select, textarea, canvas, [tabindex], [role=button]')).toHaveCount(0);
}

test('Chromium lance la préparation avec Firefox ; seuls les sièges admis la retrouvent', async ({ page }) => {
  const server = makeServer({ database: ':memory:', webRoot: fileURLToPath(new URL('../apps/web/dist', import.meta.url)) });
  const listening = once(server.http, 'listening');
  server.http.listen(0, '127.0.0.1');
  try {
    await listening;
    const address = server.http.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const otherBrowser = await firefox.launch();
    try {
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.getByLabel('Votre nom').fill('Camille');
      await page.getByRole('button', { name: 'Créer le salon' }).click();
      await expect(page.getByRole('heading', { name: 'Invitation' })).toBeVisible();
      const hostFirst = page.getByRole('region', { name: 'Premier joueur' });
      const chooseHost = hostFirst.getByRole('button', { name: 'Camille (siège 1)' });
      await expect(hostFirst.getByText('La personne qui a bu du thé le plus récemment commence.')).toBeVisible();
      await expect(hostFirst.getByRole('status')).toHaveText('Aucun premier joueur désigné.');
      await expect(chooseHost).toHaveAttribute('aria-pressed', 'false');
      const launch = page.getByRole('button', { name: 'Lancer la préparation' });
      await expect(launch).toBeDisabled();
      await expect(launch).toHaveAccessibleDescription(/entre 2 et 5 joueurs.*faction différente.*sont prêts.*Désignez le premier joueur/);
      const link = await page.getByLabel('Lien du salon').inputValue();
      expect([...new URL(link).searchParams.keys()]).toEqual(['salon']);

      const guestContext = await otherBrowser.newContext();
      let guest = await guestContext.newPage();
      await guest.goto(link);
      await guest.getByLabel('Votre nom').fill('Dinah');
      await guest.getByRole('button', { name: 'Rejoindre le salon' }).click();
      const guestFirst = guest.getByRole('region', { name: 'Premier joueur' });
      const chooseGuest = hostFirst.getByRole('button', { name: 'Dinah (siège 2)' });
      await expect(guestFirst.getByRole('status')).toHaveText('Aucun premier joueur désigné.');
      await expect(guestFirst.getByText('La personne qui a bu du thé le plus récemment commence.')).toBeVisible();
      await expect(guestFirst.getByText('Seul l’hôte peut désigner le premier joueur.')).toBeVisible();
      await expect(guestFirst.getByRole('button')).toHaveCount(0);
      await expect(guest.getByRole('button', { name: 'Lancer la préparation' })).toHaveCount(0);
      await expect(chooseGuest).toBeEnabled();
      await chooseGuest.focus();
      await page.keyboard.press('Enter');
      await expect(chooseGuest).toBeFocused();
      await expect(chooseGuest).toHaveAttribute('aria-pressed', 'true');
      await expect(chooseHost).toHaveAttribute('aria-pressed', 'false');
      for (const panel of [hostFirst, guestFirst]) {
        await expect(panel.getByRole('status')).toHaveText('Premier joueur désigné : Dinah (siège 2).');
      }
      const hostFactions = page.getByRole('region', { name: 'Votre faction' });
      const guestFactions = guest.getByRole('region', { name: 'Votre faction' });
      const hostAlice = hostFactions.getByRole('button', { name: 'Alice', exact: true });
      const guestAlice = guestFactions.getByRole('button', { name: 'Alice', exact: true });
      const guestReady = guestFactions.getByRole('button', { name: 'Je suis prêt' });
      for (const name of ['Alice', 'Chapelier fou', 'Reine de cœur', 'Jabberwocky', 'Chat du Cheshire']) {
        await expect(guestFactions.getByRole('button', { name, exact: true })).toHaveAccessibleDescription('Disponible');
      }
      await expect(guestReady).toBeDisabled();

      await guestAlice.focus();
      await guest.keyboard.press('Enter');
      await expect(guestAlice).toBeFocused();
      await expect(guestAlice).toHaveAttribute('aria-pressed', 'true');
      await expect(guestAlice).toHaveAccessibleDescription('Votre faction');
      await expect(hostAlice).toBeDisabled();
      await expect(hostAlice).toHaveAccessibleDescription('Prise');
      await guestReady.click();
      await expect(page.getByText('Dinah est prêt.')).toBeVisible();

      await Promise.all([page.reload(), guest.reload()]);
      await expect(guest.getByRole('button', { name: 'Retirer mon statut prêt' })).toBeEnabled();
      await expect(guestAlice).toHaveAttribute('aria-pressed', 'true');
      await expect(guest.getByText('Dinah est prêt.')).toHaveCount(1);
      await expect(page.getByRole('region', { name: 'Joueurs' }).getByRole('listitem')).toHaveCount(2);
      for (const panel of [hostFirst, guestFirst]) {
        await expect(panel.getByRole('status')).toHaveText('Premier joueur désigné : Dinah (siège 2).');
      }
      await expect(chooseGuest).toHaveAttribute('aria-pressed', 'true');
      await expect(guestFirst.getByRole('button')).toHaveCount(0);
      await expect(guest.getByText('Camille a désigné Dinah (siège 2) pour commencer.')).toHaveCount(1);

      await guestAlice.focus();
      await guest.keyboard.press('Tab');
      const chapelier = guestFactions.getByRole('button', { name: 'Chapelier fou', exact: true });
      await expect(chapelier).toBeFocused();
      await guest.keyboard.press('Space');
      await expect(guestReady).toBeEnabled();
      await expect(page.getByText('Dinah a remplacé Alice par Chapelier fou. Son siège est repassé non prêt.')).toBeVisible();
      await expect(hostAlice).toHaveAccessibleDescription('Disponible');
      await hostAlice.click();
      await expect(guestAlice).toHaveAccessibleDescription('Prise');
      await guestReady.click();
      await guest.getByRole('button', { name: 'Retirer mon statut prêt' }).click();
      await expect(page.getByText('Dinah a retiré son statut prêt.')).toBeVisible();
      await expect(hostFirst.getByRole('status')).toHaveText('Premier joueur désigné : Dinah (siège 2).');
      await expect(launch).toBeDisabled();
      await expect(launch).toHaveAccessibleDescription('Tous les joueurs doivent confirmer qu’ils sont prêts.');
      await page.getByRole('button', { name: 'Je suis prêt' }).click();
      await expect(guest.getByText('Camille est prêt.')).toBeVisible();
      await guestReady.click();
      await expect(launch).toBeEnabled();
      for (const player of [page, guest]) {
        await expect(player.getByRole('region', { name: previewTitle })).toHaveCount(0);
      }
      await launch.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Préparation de la partie' })).toBeFocused();

      async function checkPreparation() {
        for (const player of [page, guest]) {
          const panel = player.getByRole('region', { name: 'Préparation de la partie' });
          await expect(panel.getByText('Admissions fermées.')).toBeVisible();
          await expect(panel.getByText(/2 joueurs/)).toBeVisible();
          const seats = panel.getByRole('listitem');
          await expect(seats).toHaveCount(2);
          await expect(seats.nth(0)).toContainText(/Camille \(siège 1\).*Alice/);
          await expect(seats.nth(1)).toContainText(/Dinah \(siège 2\).*Chapelier fou.*Premier joueur \(J1\)/);
          await expect(player.getByRole('region', { name: 'Votre faction' })).toHaveCount(0);
          await expect(player.getByRole('region', { name: 'Premier joueur' })).toHaveCount(0);
          await expect(player.getByRole('button', { name: 'Lancer la préparation' })).toHaveCount(0);
          await expect(player.getByText('Camille a lancé la préparation.')).toHaveCount(1);
          await checkBoard(player);
        }
      }
      await checkPreparation();
      await Promise.all([page.reload(), guest.reload()]);
      await checkPreparation();

      await guest.close();
      guest = await guestContext.newPage();
      await guest.setViewportSize({ width: 320, height: 720 });
      await guest.goto(link);
      await checkPreparation();

      await guest.route('**/plateau-principal-fr*.webp', (route) => route.abort());
      await guest.reload();
      const preview = guest.getByRole('region', { name: previewTitle });
      const unavailable = preview.getByRole('img', { name: /Plateau central officiel en français/ });
      await expect.poll(() => unavailable.evaluate((image: HTMLImageElement) => image.complete && !image.naturalWidth)).toBe(true);
      await expect(preview.getByText(teaSummary, { exact: true })).toBeVisible();
      await expect(preview.locator('.board-blocker')).toHaveCount(0);

      const newcomer = await otherBrowser.newPage();
      await newcomer.goto(link);
      await newcomer.getByLabel('Votre nom').fill('Nouveau joueur');
      await newcomer.getByRole('button', { name: 'Rejoindre le salon' }).click();
      await expect(newcomer.getByRole('alert')).toContainText('Le salon est fermé aux nouvelles admissions');
      await expect(newcomer.getByRole('region', { name: 'Préparation de la partie' })).toHaveCount(0);
      await expect(newcomer.getByRole('img', { name: /Plateau central officiel en français/ })).toHaveCount(0);
    } finally {
      await otherBrowser.close();
    }
  } finally {
    await server.close();
  }
});
