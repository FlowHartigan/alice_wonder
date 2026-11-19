import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { expect, firefox, test } from '@playwright/test';
import { makeServer } from '../apps/server/src/server.ts';

test('Chromium invite Firefox ; la désignation, les factions et les statuts survivent aux rechargements', async ({ page }) => {
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
      const link = await page.getByLabel('Lien du salon').inputValue();
      expect([...new URL(link).searchParams.keys()]).toEqual(['salon']);

      const guest = await otherBrowser.newPage();
      await guest.goto(link);
      await guest.getByLabel('Votre nom').fill('Dinah');
      await guest.getByRole('button', { name: 'Rejoindre le salon' }).click();
      const guestFirst = guest.getByRole('region', { name: 'Premier joueur' });
      const chooseGuest = hostFirst.getByRole('button', { name: 'Dinah (siège 2)' });
      await expect(guestFirst.getByRole('status')).toHaveText('Aucun premier joueur désigné.');
      await expect(guestFirst.getByText('La personne qui a bu du thé le plus récemment commence.')).toBeVisible();
      await expect(guestFirst.getByText('Seul l’hôte peut désigner le premier joueur.')).toBeVisible();
      await expect(guestFirst.getByRole('button')).toHaveCount(0);
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
    } finally {
      await otherBrowser.close();
    }
  } finally {
    await server.close();
  }
});
