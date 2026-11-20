import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, firefox, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { FACTION_IDS } from '@wonderland/shared';
import type { ClientEvents, LobbyView, Reply, ServerEvents, Session } from '@wonderland/shared';
import { makeServer } from '../apps/server/src/server.ts';

const previewTitle = 'Aperçu du plateau — lecture seule';
const teaSummary = 'Table du Thé : 11 chaises ouvertes. Chaises 4J et 5J bloquées. Aucune carte n’est installée.';
const scoreCaption = 'Marqueurs Score de Région — attribution initiale';
const firstTeaCaption = 'Aperçu — ordre prévu du premier Thé et Éclats de départ';
const deferredRemoval = /la Région désignée par la Quête et son marqueur seront retirés à une étape ultérieure/;
const reveal = 'Quête révélée : Remporter le croquet du Jardin. Région hors jeu : Jardin des Fleurs vivantes.';
const excluded = 'jardin-des-fleurs-vivantes';
const boardName = /Plateau central officiel en français/;
const scoreSlots = [
  { id: 'donjon-rouge', name: 'Donjon rouge', pv: ['2', '6', '12'], x: 0.874, y: 0.671 },
  { id: 'foret-de-tulgey', name: 'Forêt de Tulgey', pv: ['2', '8', '10'], x: 0.569, y: 0.892 },
  { id: 'jardin-des-fleurs-vivantes', name: 'Jardin des Fleurs vivantes', pv: ['4', '6', '10'], x: 0.112, y: 0.632 },
  { id: 'mare-de-larmes', name: 'Mare de Larmes', pv: ['4', '8', '8'], x: 0.113, y: 0.516 },
  { id: 'comte-de-la-deraison', name: 'Comté de la Déraison', pv: ['6', '6', '8'], x: 0.886, y: 0.558 },
];

function firstBattleSummary(regionName: string) {
  return `Premier combat : ${regionName}. Dé Éclat : 2.`;
}

async function checkFirstBattle(player: Page, region: typeof scoreSlots[number], imageLoaded = true) {
  const preview = player.getByRole('region', { name: previewTitle });
  await expect(preview.getByText(firstBattleSummary(region.name), { exact: true })).toBeVisible();
  const marker = preview.locator('.board-first-battle');
  if (!imageLoaded) {
    await expect(marker).toHaveCount(0);
    return;
  }
  await expect(marker).toHaveCount(1);
  await expect(preview.getByRole('img', { name: `Marqueur Premier combat : ${region.name}` })).toBeVisible();
  await expect(marker).toHaveAttribute('data-region', region.id);
  await expect(marker).toHaveText('1er combat');
  await expect(marker).toHaveCSS('pointer-events', 'none');
  await expect(preview.locator(`.board-region-excluded[data-region="${region.id}"]`)).toHaveCount(0);
  const image = await preview.getByRole('img', { name: boardName }).boundingBox();
  const score = await preview.locator(`.board-score-marker[data-region="${region.id}"]`).boundingBox();
  const box = await marker.boundingBox();
  if (!image || !score || !box) throw new Error('Repère de Premier combat introuvable');
  expect((box.x + box.width / 2 - image.x) / image.width).toBeCloseTo(region.x, 3);
  expect(box.y >= score.y + score.height || box.y + box.height <= score.y).toBe(true);
}

async function checkFirstTea(player: Page, expected: [string, string][]) {
  const table = player.getByRole('table', { name: firstTeaCaption });
  await expect(table).toBeVisible();
  await expect(table).toHaveAccessibleDescription('Les Éclats de départ sont prévus, pas encore crédités. Le premier Thé n’a pas commencé.');
  await expect(table.getByRole('columnheader')).toHaveText(['Rang', 'Joueur', 'Éclats prévus']);
  await expect(table.getByRole('rowheader')).toHaveText(expected.map((_, i) => `J${i + 1}`));
  for (const [i, cells] of expected.entries()) {
    const row = table.getByRole('row').filter({ has: player.getByRole('rowheader', { name: `J${i + 1}`, exact: true }) });
    await expect(row.getByRole('cell')).toHaveText(cells);
  }
  await expect(table.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0);
}

async function checkScores(player: Page, { twoPlayers, imageLoaded = true }: { twoPlayers: boolean; imageLoaded?: boolean }) {
  const preview = player.getByRole('region', { name: previewTitle });
  const table = preview.getByRole('table', { name: scoreCaption });
  const activeSlots = scoreSlots.filter(({ id }) => !twoPlayers || id !== excluded);
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText(['Région', 'PV round I', 'PV round II', 'PV round III']);
  await expect(table.getByRole('rowheader')).toHaveText(activeSlots.map(({ name }) => name));
  await expect(preview.getByText(deferredRemoval)).toHaveCount(0);
  const badge = preview.locator('.board-region-excluded');
  if (twoPlayers) {
    await expect(preview.getByText(reveal, { exact: true })).toBeVisible();
    await expect(preview.getByRole('img', { name: boardName }))
      .toHaveAccessibleDescription(`${teaSummary} ${reveal} ${firstBattleSummary(scoreSlots[0].name)}`);
    if (imageLoaded) {
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('Hors jeu');
      await expect(badge).toHaveAttribute('data-region', excluded);
      await expect(badge).toHaveAttribute('aria-hidden', 'true');
    } else await expect(badge).toHaveCount(0);
  } else {
    await expect(preview.getByText(/Quête révélée|Région hors jeu/)).toHaveCount(0);
    await expect(badge).toHaveCount(0);
  }
  const markers = preview.locator('.board-score-marker');
  await expect(markers).toHaveCount(imageLoaded ? activeSlots.length : 0);
  const image = await preview.getByRole('img', { name: boardName }).boundingBox();
  if (!image) throw new Error('Aperçu introuvable');
  for (const { id, name, pv, x, y } of activeSlots) {
    const row = table.getByRole('row').filter({ has: player.getByRole('rowheader', { name, exact: true }) });
    await expect(row.getByRole('cell')).toHaveText(pv);
    if (!imageLoaded) continue;
    const marker = markers.and(preview.locator(`[data-region="${id}"]`));
    await expect(marker).toHaveText(pv.join('/'));
    await expect(marker).toHaveAttribute('aria-hidden', 'true');
    await expect(marker).toHaveCSS('pointer-events', 'none');
    const box = await marker.boundingBox();
    if (!box) throw new Error(`Marqueur absent : ${id}`);
    expect((box.x + box.width / 2 - image.x) / image.width).toBeCloseTo(x, 3);
    expect((box.y + box.height / 2 - image.y) / image.height).toBeCloseTo(y, 3);
  }
}

async function checkBoard(player: Page) {
  const preview = player.getByRole('region', { name: previewTitle });
  const image = preview.getByRole('img', { name: boardName });
  await expect(preview.getByText(teaSummary, { exact: true })).toBeVisible();
  await expect(image).toHaveAccessibleDescription(`${teaSummary} ${reveal} ${firstBattleSummary(scoreSlots[0].name)}`);
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
  await expect(preview.locator('a, button, input, select, textarea, canvas, [role=button]')).toHaveCount(0);
}

test('Chromium lance la préparation avec Firefox ; seuls les sièges admis la retrouvent', async ({ page }) => {
  let draws = 0;
  const server = makeServer({ database: ':memory:', webRoot: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
    random: () => ++draws === 35 ? 0.5 : 0 });
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
        await expect(player.getByRole('table', { name: scoreCaption })).toHaveCount(0);
        await expect(player.getByRole('table', { name: firstTeaCaption })).toHaveCount(0);
      }
      await launch.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Préparation de la partie' })).toBeFocused();

      async function checkPreparation() {
        for (const player of [page, guest]) {
          const panel = player.getByRole('region', { name: 'Préparation de la partie' });
          await expect(panel.getByText('Admissions fermées.')).toBeVisible();
          await expect(panel.getByText(/^Salon [A-F0-9]{8} · 2 joueurs$/)).toBeVisible();
          const seats = panel.getByRole('listitem');
          await expect(seats).toHaveCount(2);
          await expect(seats.nth(0)).toContainText(/Camille \(siège 1\).*Alice/);
          await expect(seats.nth(1)).toContainText(/Dinah \(siège 2\).*Chapelier fou.*Premier joueur \(J1\)/);
          await expect(player.getByRole('region', { name: 'Votre faction' })).toHaveCount(0);
          await expect(player.getByRole('region', { name: 'Premier joueur' })).toHaveCount(0);
          await expect(player.getByRole('button', { name: 'Lancer la préparation' })).toHaveCount(0);
          await expect(player.getByText('Camille a lancé la préparation.')).toHaveCount(1);
          await checkFirstTea(player, [['Dinah (siège 2)', '2'], ['Camille (siège 1)', '1']]);
          await checkBoard(player);
          await checkScores(player, { twoPlayers: true });
          await checkFirstBattle(player, scoreSlots[0]);
        }
      }
      await checkPreparation();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('table', { name: scoreCaption })).toBeFocused();
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
      await checkScores(guest, { twoPlayers: true, imageLoaded: false });
      await checkFirstBattle(guest, scoreSlots[0], false);

      const newcomer = await otherBrowser.newPage();
      await newcomer.goto(link);
      await newcomer.getByLabel('Votre nom').fill('Nouveau joueur');
      await newcomer.getByRole('button', { name: 'Rejoindre le salon' }).click();
      await expect(newcomer.getByRole('alert')).toContainText('Le salon est fermé aux nouvelles admissions');
      await expect(newcomer.getByRole('region', { name: 'Préparation de la partie' })).toHaveCount(0);
      await expect(newcomer.getByRole('table', { name: firstTeaCaption })).toHaveCount(0);
      await expect(newcomer.getByRole('img', { name: /Plateau central officiel en français/ })).toHaveCount(0);
      await expect(newcomer.getByText(/Quête révélée|Région hors jeu|Premier combat|Dé Éclat/)).toHaveCount(0);
      expect(draws).toBe(35);
    } finally {
      await otherBrowser.close();
    }
  } finally {
    await server.close();
  }
});

for (const count of [3, 4, 5]) test(`${count} sièges dont ${count - 1} simulés : Premier combat partagé, cinq scores, pas de retrait`, async ({ page }) => {
  let draws = 0;
  const server = makeServer({ database: ':memory:', webRoot: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
    random: () => ++draws === 6 ? 0.5 : 0 });
  const clients: Socket<ServerEvents, ClientEvents>[] = [];
  const guests: { session: Session; id: string }[] = [];
  const preparedViews = new Map<string, LobbyView>();
  function success<T>(reply: Reply<T>): T {
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }
  const listening = once(server.http, 'listening');
  server.http.listen(0, '127.0.0.1');
  try {
    await listening;
    const address = server.http.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const url = `http://127.0.0.1:${address.port}`;
    await page.goto(url);
    await page.getByLabel('Votre nom').fill('Camille');
    await page.getByRole('button', { name: 'Créer le salon' }).click();
    const code = new URL(await page.getByLabel('Lien du salon').inputValue()).searchParams.get('salon')!;
    await page.getByRole('button', { name: 'Alice', exact: true }).click();
    await page.getByRole('button', { name: 'Je suis prêt' }).click();
    await expect(page.getByRole('button', { name: 'Retirer mon statut prêt' })).toBeEnabled();
    for (const [i, faction] of FACTION_IDS.slice(1, count).entries()) {
      const guest: Socket<ServerEvents, ClientEvents> = io(url, { forceNew: true, ackTimeout: 2000, transports: ['websocket'] });
      clients.push(guest);
      guest.on('lobby:update', (view) => {
        if (view.preparation) preparedViews.set(view.you, view);
      });
      const { view, session } = success(await guest.emitWithAck('lobby:join', { code, name: `Invité ${i + 1}` }));
      guests.push({ session, id: view.you });
      const picked = success(await guest.emitWithAck('lobby:action', {
        type: 'select-faction', actionId: randomUUID(), expectedRevision: view.revision, faction,
      }));
      success(await guest.emitWithAck('lobby:action', {
        type: 'set-ready', actionId: randomUUID(), expectedRevision: picked.revision, ready: true,
      }));
    }
    await expect(page.getByText(`Invité ${count - 1} est prêt.`)).toBeVisible();
    await page.getByRole('button', { name: 'Invité 2 (siège 3)' }).click();
    await expect(page.getByRole('table', { name: scoreCaption })).toHaveCount(0);
    await expect(page.getByRole('table', { name: firstTeaCaption })).toHaveCount(0);
    await page.getByRole('button', { name: 'Lancer la préparation' }).click();
    await expect(page.getByRole('heading', { name: 'Préparation de la partie' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('table', { name: scoreCaption })).toBeFocused();
    const preview = page.getByRole('region', { name: previewTitle });
    await expect(preview.getByText(`${count + 8} chaises ouvertes.`, { exact: false })).toBeVisible();
    await expect(preview.locator('.board-blocker')).toHaveCount(5 - count);
    await checkScores(page, { twoPlayers: false });
    const garden = scoreSlots[2];
    await checkFirstBattle(page, garden);
    const labels = [...guests.slice(1).map((_, i) => `Invité ${i + 2} (siège ${i + 3})`), 'Camille (siège 1)', 'Invité 1 (siège 2)'];
    const shards = count === 3 ? [3, 2, 1] : count === 4 ? [3, 2, 2, 1] : [3, 2, 2, 1, 0];
    const expected: [string, string][] = labels.map((label, i) => [label, String(shards[i])]);
    await checkFirstTea(page, expected);
    await expect.poll(() => preparedViews.size).toBe(count - 1);
    const [firstGuest, secondGuest] = guests;
    const { hostId, preparation: shared } = preparedViews.get(firstGuest.id)!;
    expect(shared?.firstTeaPreview).toEqual([...guests.slice(1).map(({ id }) => id), hostId, firstGuest.id]
      .map((playerId, i) => ({ playerId, turn: i + 1, plannedShards: shards[i] })));
    expect(shared?.twoPlayerSetup).toBeNull();
    expect(shared?.firstBattle).toEqual({ dieResult: 2, region: { id: garden.id, name: garden.name } });
    for (const { id } of guests) expect(preparedViews.get(id)?.preparation).toEqual(shared);

    clients[1].disconnect();
    await page.reload();
    await checkFirstTea(page, expected);
    await checkFirstBattle(page, garden);
    const returned: Socket<ServerEvents, ClientEvents> = io(url, { forceNew: true, ackTimeout: 2000, transports: ['websocket'] });
    clients.push(returned);
    expect(success(await returned.emitWithAck('lobby:resume', secondGuest.session)).preparation).toEqual(shared);
    expect(draws).toBe(6);
  } finally {
    for (const client of clients) client.disconnect();
    await server.close();
  }
});
