import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, firefox, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { FACTION_IDS, FACTION_NAMES } from '@wonderland/shared';
import type { ClientEvents, LobbyView, Reply, ServerEvents, Session } from '@wonderland/shared';
import { makeServer } from '../apps/server/src/server.ts';

const previewTitle = 'Aperçu du plateau — lecture seule';
const teaSummary = 'Table du Thé : 11 chaises ouvertes. Chaises 4J et 5J bloquées. Aucune carte n’est installée.';
const scoreCaption = 'Marqueurs Score de Région — attribution initiale';
const firstTeaCaption = 'Aperçu — ordre prévu du premier Thé et Éclats de départ';
const shardsWaiting = (page: Page) => page.getByText('Les Éclats de départ ne sont pas encore crédités : ils seront attribués quand le plateau commun sera prêt.', { exact: true });
const resourcesTitle = 'Dotation individuelle de départ';
const questTitle = 'Votre Quête initiale (étape J)';
const questPanel = (page: Page) => page.getByRole('region', { name: questTitle });
const betsPanel = (page: Page) => page.getByRole('region', { name: 'Vos cartes Pari' });
const phaseReference = (page: Page) => page.getByRole('region', { name: 'Aide des phases' });
const leadersList = (page: Page) => page.getByRole('list', { name: 'Chefs en Bout de Table' });
const leaderGroup = (page: Page) => page.locator('.board-leader-group');
const allyLinkName = 'Tableau des Alliés A–D (livret officiel FR, p. 9)';
const seriesPanel = (page: Page) => page.getByRole('region', { name: 'Série des Alliés', exact: true });
const rulebook = 'https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416';
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

async function checkNoLateSetup(player: Page) {
  await expect(betsPanel(player)).toHaveCount(0);
  await expect(phaseReference(player)).toHaveCount(0);
  await expect(leadersList(player)).toHaveCount(0);
  await expect(leaderGroup(player)).toHaveCount(0);
  await expect(shardsWaiting(player)).toHaveCount(0);
}

async function checkPhaseReference(player: Page) {
  const aide = phaseReference(player);
  await expect(aide.getByRole('heading', { level: 4 })).toHaveText(['Thé — livret FR, p. 7', 'Guerre — livret FR, p. 12']);
  await expect(aide.getByRole('link', { name: /exceptions à deux joueurs/ })).toHaveAttribute('href', `${rulebook}#page=21`);
  await expect(aide.locator('button, input, select, textarea')).toHaveCount(0);
  await expect(player.getByRole('region', { name: 'Préparation de la partie' }).getByRole('button')).toHaveCount(0);
}

async function checkLeaders(player: Page, expected: [string, string][], { imageLoaded = true, compact = false } = {}) {
  const list = leadersList(player);
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveText(expected.map(([name, code]) => `${name} (${code})`));
  const group = leaderGroup(player);
  if (!imageLoaded) {
    await expect(group).toHaveCount(0);
    return;
  }
  await expect(group).toHaveAttribute('data-zone', 'end-of-table');
  await expect(group).toHaveAttribute('aria-hidden', 'true');
  await expect(group).toHaveCSS('pointer-events', 'none');
  const markers = group.locator('.board-leader');
  await expect(markers).toHaveText(expected.map(([, code]) => code));
  const image = await player.getByRole('img', { name: boardName }).boundingBox();
  if (!image) throw new Error('Plateau introuvable');
  for (const marker of await markers.all()) {
    await expect(marker).toBeVisible();
    const box = await marker.boundingBox();
    if (!box) throw new Error('Repère de Chef introuvable');
    // Between the deck and bottom chair: near the ribbon, or inward by the die spot on narrow boards at 2J.
    expect((box.x - image.x) / image.width).toBeGreaterThan(compact ? 0.685 : 0.74);
    expect((box.x + box.width - image.x) / image.width).toBeLessThan(compact ? 0.76 : 0.835);
    expect((box.y - image.y) / image.height).toBeGreaterThan(compact ? 0.36 : 0.33);
    expect((box.y + box.height - image.y) / image.height).toBeLessThan(compact ? 0.55 : 0.525);
  }
}

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
  await expect(table).toHaveCount(1);
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

async function checkIndividualResources(player: Page, expected: [string, number][]) {
  const panel = player.getByRole('region', { name: resourcesTitle });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAccessibleDescription('Ressources attribuées en préparation (étapes A à I), en lecture seule. Pour chaque sac, seul le nombre de jetons est visible.');
  await expect(panel.getByRole('heading', { level: 4 })).toHaveText(expected.map(([label]) => label));
  const twoPlayers = expected.length === 2;
  for (const [name, poison] of expected) {
    const card = panel.getByRole('article', { name, exact: true });
    await expect(card.getByRole('term')).toHaveText([
      'Plateau de faction', 'Partisans en réserve', 'Partisans sur la troisième piste de Forge', 'Châteaux en réserve',
      'Artefacts sur la Forge', 'Capacités couvertes', 'Force du Chef', 'Bouclier', 'Points de victoire (PV)',
      'Piste de Combat', 'Jetons dans le sac', 'Jetons Poison en réserve', 'Jetons actifs', 'Jetons épuisés', 'Jetons sur la piste de Folie',
    ]);
    await expect(card.getByRole('definition')).toHaveText([
      twoPlayers ? 'Face dorée « 2 JOUEURS »' : 'Face ordinaire', '10', '4', '5', '4', '4', '1', 'Intact', '0', '0',
      twoPlayers ? '11' : '10', String(poison), '0', '0', '0',
    ]);
  }
  await expect(panel.locator('a, button, input, select, textarea, img, [tabindex]')).toHaveCount(0);
  await expect(panel.getByText(/Éclats|premier Thé|Quête/)).toHaveCount(0);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
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
    random: () => ++draws === 35 ? 0.5 : 0 }); // Le dé suit les marqueurs et les Quêtes, avant les sacs.
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
      const hostSeries = seriesPanel(page);
      const guestSeries = seriesPanel(guest);
      const seriesSelect = hostSeries.getByRole('combobox', { name: 'Série retenue' });
      const confirmSeries = hostSeries.getByRole('button', { name: 'Confirmer la série' });
      await expect(seriesSelect).toHaveValue('');
      await expect(seriesSelect.getByRole('option')).toHaveText(['Choisir une série', 'A', 'B', 'C', 'D']);
      await expect(seriesSelect).toHaveAccessibleDescription(/Après accord de la table.*facultatif/);
      await expect(confirmSeries).toBeDisabled();
      await expect(guestSeries.getByRole('status')).toHaveText('Série non choisie');
      await expect(guestSeries.locator('button, select')).toHaveCount(0);
      await expect(guestSeries.getByRole('link', { name: allyLinkName })).toHaveAttribute('href', `${rulebook}#page=9`);
      await seriesSelect.focus();
      await page.keyboard.press('End');
      await expect(seriesSelect).toHaveValue('D');
      for (const panel of [hostSeries, guestSeries]) await expect(panel.getByRole('status')).toHaveText('Série non choisie');
      await page.keyboard.press('Tab');
      await expect(confirmSeries).toBeFocused();
      await page.keyboard.press('Enter');
      for (const panel of [hostSeries, guestSeries]) await expect(panel.getByRole('status')).toHaveText('Série choisie : D');
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
      for (const panel of [hostSeries, guestSeries]) await expect(panel.getByRole('status')).toHaveText('Série choisie : D');
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
      await expect(guestFactions.getByRole('button', { name: 'Chapelier fou', exact: true })).toBeFocused();
      await guest.keyboard.press('Tab');
      await guest.keyboard.press('Tab');
      await expect(guestFactions.getByRole('button', { name: 'Jabberwocky', exact: true })).toBeFocused();
      await guest.keyboard.press('Space');
      await expect(guestReady).toBeEnabled();
      await expect(page.getByText('Dinah a remplacé Alice par Jabberwocky. Son siège est repassé non prêt.')).toBeVisible();
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
        await expect(player.getByRole('region', { name: resourcesTitle })).toHaveCount(0);
        await expect(questPanel(player)).toHaveCount(0);
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
          const seats = panel.getByRole('list', { name: 'Sièges et factions de la préparation' }).getByRole('listitem');
          await expect(seats).toHaveCount(2);
          await expect(seats.nth(0)).toContainText(/Camille \(siège 1\).*Alice/);
          await expect(seats.nth(1)).toContainText(/Dinah \(siège 2\).*Jabberwocky.*Premier joueur \(J1\)/);
          await expect(player.getByRole('region', { name: 'Votre faction' })).toHaveCount(0);
          await expect(player.getByRole('region', { name: 'Premier joueur' })).toHaveCount(0);
          await expect(seriesPanel(player).getByRole('status')).toHaveText('Série choisie : D');
          await expect(seriesPanel(player).locator('button, select')).toHaveCount(0);
          await expect(player.getByRole('button', { name: 'Lancer la préparation' })).toHaveCount(0);
          await expect(player.getByText('Camille a lancé la préparation.')).toHaveCount(1);
          await checkFirstTea(player, [['Dinah (siège 2)', '2'], ['Camille (siège 1)', '1']]);
          await checkIndividualResources(player, [['Camille (siège 1) — Alice', 0], ['Dinah (siège 2) — Jabberwocky', 4]]);
          await checkBoard(player);
          await checkScores(player, { twoPlayers: true });
          await checkFirstBattle(player, scoreSlots[0]);
        }
      }
      await checkPreparation();
      const hostQuest = questPanel(page);
      const guestQuest = questPanel(guest);
      for (const player of [page, guest]) await checkNoLateSetup(player);
      for (const panel of [hostQuest, guestQuest]) {
        await expect(panel.getByRole('article')).toHaveCount(2);
        await expect(panel.getByText(/^Exploit — /)).toHaveCount(2);
        await expect(panel.getByText('Objectif', { exact: true })).toHaveCount(2);
        await expect(panel).toHaveAccessibleDescription(/Textes français non officiels/);
      }
      const hostTitles = ['Rassembler une ménagerie', 'Se lier d’amitié avec le forgeron aux oiseaux'];
      const guestTitles = ['La révolution industrielle', 'Rallier les faibles'];
      await expect(hostQuest.getByRole('heading', { level: 4 })).toHaveText(hostTitles);
      await expect(guestQuest.getByRole('heading', { level: 4 })).toHaveText(guestTitles);
      for (const title of hostTitles) await expect(guest.getByText(title, { exact: true })).toHaveCount(0);
      for (const title of guestTitles) await expect(page.getByText(title, { exact: true })).toHaveCount(0);
      for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
      await expect(page.getByRole('table', { name: scoreCaption })).toBeFocused();
      await Promise.all([page.reload(), guest.reload()]);
      await checkPreparation();
      await expect(hostQuest.getByRole('heading', { level: 4 })).toHaveText(hostTitles);
      await expect(guestQuest.getByRole('heading', { level: 4 })).toHaveText(guestTitles);
      const hostChoice = hostQuest.getByRole('button', { name: `Garder « ${hostTitles[1]} »` });
      await hostChoice.focus();
      await page.keyboard.press('Enter');
      await expect(hostQuest.getByRole('status')).toHaveText(/Choix enregistré/);
      await expect(hostQuest.getByRole('status')).toBeFocused();
      await expect(hostQuest.getByRole('heading', { level: 4 })).toHaveText([hostTitles[1]]);
      await expect(guestQuest.getByRole('heading', { level: 4 })).toHaveText(guestTitles);
      await expect(guestQuest.getByRole('status')).toContainText('Ces deux propositions sont privées');
      for (const player of [page, guest]) {
        await checkNoLateSetup(player);
        await checkFirstTea(player, [['Dinah (siège 2)', '2'], ['Camille (siège 1)', '1']]);
      }
      await guestQuest.getByRole('button', { name: `Garder « ${guestTitles[0]} »` }).click();
      await expect(guestQuest.getByRole('status')).toHaveText(/Choix enregistré/);
      const checkEmptyHand = async (player: Page) => {
        await expect(betsPanel(player).getByText('Aucune carte Pari à deux joueurs.')).toBeVisible();
        await expect(betsPanel(player).getByRole('listitem')).toHaveCount(0);
        await expect(betsPanel(player).getByRole('button')).toHaveCount(0);
      };
      const leaders: [string, string][] = [['Camille — Alice', 'AL'], ['Dinah — Jabberwocky', 'JA']];
      const checkLateSetup = async (player: Page, compact = false) => {
        await checkEmptyHand(player);
        await checkPhaseReference(player);
        await checkLeaders(player, leaders, { compact });
        await expect(shardsWaiting(player)).toBeVisible();
        await expect(player.locator('[aria-live="polite"]').filter({ has: shardsWaiting(player) })).toHaveCount(1);
        await checkFirstTea(player, [['Dinah (siège 2)', '2'], ['Camille (siège 1)', '1']]);
      };
      await Promise.all([checkLateSetup(page), checkLateSetup(guest)]);
      await expect(guest.getByRole('region', { name: 'Journal du salon' })).not.toContainText(guestTitles[0]);
      for (const [player, title, absent] of [[page, hostTitles[1], guestTitles[0]], [guest, guestTitles[0], hostTitles[1]]] as const) {
        await player.reload();
        await expect(questPanel(player).getByRole('heading', { level: 4 })).toHaveText([title]);
        await expect(questPanel(player).getByRole('button')).toHaveCount(0);
        await expect(player.getByText(absent, { exact: true })).toHaveCount(0);
        await expect(player.getByText(/Le premier Thé n’a pas commencé/)).toBeVisible();
        await checkLateSetup(player);
      }

      await guest.close();
      guest = await guestContext.newPage();
      await guest.setViewportSize({ width: 320, height: 720 });
      await guest.goto(link);
      await checkPreparation();
      await checkLateSetup(guest, true);

      await guest.route('**/plateau-principal-fr*.webp', (route) => route.abort());
      await guest.reload();
      const preview = guest.getByRole('region', { name: previewTitle });
      const unavailable = preview.getByRole('img', { name: /Plateau central officiel en français/ });
      await expect.poll(() => unavailable.evaluate((image: HTMLImageElement) => image.complete && !image.naturalWidth)).toBe(true);
      await expect(preview.getByText(teaSummary, { exact: true })).toBeVisible();
      await expect(preview.locator('.board-blocker')).toHaveCount(0);
      await checkScores(guest, { twoPlayers: true, imageLoaded: false });
      await checkFirstBattle(guest, scoreSlots[0], false);
      await checkLeaders(guest, leaders, { imageLoaded: false });

      const newcomer = await otherBrowser.newPage();
      await newcomer.goto(link);
      await newcomer.getByLabel('Votre nom').fill('Nouveau joueur');
      await newcomer.getByRole('button', { name: 'Rejoindre le salon' }).click();
      await expect(newcomer.getByRole('alert')).toContainText('Le salon est fermé aux nouvelles admissions');
      await expect(newcomer.getByRole('region', { name: 'Préparation de la partie' })).toHaveCount(0);
      await expect(newcomer.getByRole('table', { name: firstTeaCaption })).toHaveCount(0);
      await expect(newcomer.getByRole('region', { name: resourcesTitle })).toHaveCount(0);
      await expect(questPanel(newcomer)).toHaveCount(0);
      await expect(seriesPanel(newcomer)).toHaveCount(0);
      await checkNoLateSetup(newcomer);
      await expect(newcomer.getByRole('img', { name: /Plateau central officiel en français/ })).toHaveCount(0);
      await expect(newcomer.getByText(/Quête révélée|Région hors jeu|Premier combat|Dé Éclat/)).toHaveCount(0);
      // Exercise the native link with the keyboard without depending on an external PDF viewer.
      await page.route(rulebook, (route) => route.fulfill({ contentType: 'text/plain', body: 'Livret FR' }));
      await page.getByRole('heading', { name: 'Préparation de la partie' }).focus();
      await page.keyboard.press('Tab');
      await expect(seriesPanel(page).getByRole('link', { name: allyLinkName })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${rulebook}#page=9`);
      expect(draws).toBe(35 + 2 * 10 + 20 + 21); // Chaque retour agrandit la pioche avant son mélange.
    } finally {
      await otherBrowser.close();
    }
  } finally {
    await server.close();
  }
});

test('à 320 px, les Chefs au Bout de Table ne recouvrent pas Premier combat au Comté', async ({ browser, page }) => {
  const server = makeServer({ database: ':memory:', webRoot: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
    random: () => 0 }); // Le mélange révèle le Jardin ; le dé 1 mène de la Mare au Comté.
  const listening = once(server.http, 'listening');
  server.http.listen(0, '127.0.0.1');
  try {
    await listening;
    const address = server.http.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByLabel('Votre nom').fill('Camille');
    await page.getByRole('button', { name: 'Créer le salon' }).click();
    const link = await page.getByLabel('Lien du salon').inputValue();
    const guest = await browser.newPage();
    try {
      await guest.goto(link);
      await guest.getByLabel('Votre nom').fill('Dinah');
      await guest.getByRole('button', { name: 'Rejoindre le salon' }).click();
      await page.getByRole('button', { name: 'Alice', exact: true }).click();
      await guest.getByRole('button', { name: 'Jabberwocky', exact: true }).click();
      await page.getByRole('button', { name: 'Je suis prêt' }).click();
      await guest.getByRole('button', { name: 'Je suis prêt' }).click();
      await expect(page.getByText('Dinah est prêt.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Dinah (siège 2)' }).click();
      await page.getByRole('button', { name: 'Lancer la préparation' }).click();

      const preview = page.getByRole('region', { name: previewTitle });
      await expect(preview.getByText(reveal, { exact: true })).toBeVisible();
      await expect(preview.getByText('Premier combat : Comté de la Déraison. Dé Éclat : 1.', { exact: true })).toBeVisible();
      await checkNoLateSetup(page);
      await questPanel(page).getByRole('button', { name: 'Garder « Rassembler une ménagerie »' }).click();
      await questPanel(guest).getByRole('button', { name: 'Garder « La révolution industrielle »' }).click();
      for (const width of [320, 280]) {
        await page.setViewportSize({ width, height: 720 });
        await checkLeaders(page, [['Camille — Alice', 'AL'], ['Dinah — Jabberwocky', 'JA']], { compact: true });
        await expect(preview.getByRole('img', { name: 'Marqueur Premier combat : Comté de la Déraison' })).toBeVisible();

        const groupBox = await leaderGroup(page).boundingBox();
        if (!groupBox) throw new Error('Groupe de Chefs non visible');
        const otherMarkers = preview.locator('.board-first-battle, .board-score-marker, .board-blocker, .board-region-excluded');
        await expect(otherMarkers).toHaveCount(8); // Premier combat, quatre scores, deux bloqueurs et une Région écartée.
        for (const marker of await otherMarkers.all()) {
          await expect(marker).toBeVisible();
          const box = await marker.boundingBox();
          if (!box) throw new Error('Repère du plateau non visible');
          const overlap = groupBox.x < box.x + box.width && box.x < groupBox.x + groupBox.width
            && groupBox.y < box.y + box.height && box.y < groupBox.y + groupBox.height;
          expect(overlap, `${width} px : Chefs / ${await marker.textContent()}`).toBe(false);
        }
      }
    } finally {
      await guest.close();
    }
  } finally {
    await server.close();
  }
});

async function checkMultiseatSetup(page: Page, count: number) {
  let draws = 0;
  const server = makeServer({ database: ':memory:', webRoot: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
    random: () => ++draws === 35 ? 0.5 : 0 }); // Le dé suit aussi le mélange de Quêtes à 3–5J.
  const clients: Socket<ServerEvents, ClientEvents>[] = [];
  const guests: { session: Session; id: string }[] = [];
  const lobbyViews = new Map<string, LobbyView>();
  const preparedViews = new Map<string, LobbyView>();
  function recordPreparation(view: LobbyView) {
    if (view.preparation) preparedViews.set(view.you, view);
    else lobbyViews.set(view.you, view);
  }
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
      guest.on('lobby:update', recordPreparation);
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
    await expect(page.getByRole('region', { name: resourcesTitle })).toHaveCount(0);
    await expect(shardsWaiting(page)).toHaveCount(0);
    await expect(seriesPanel(page).getByRole('status')).toHaveText('Série non choisie');
    await expect(seriesPanel(page).getByRole('combobox')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Lancer la préparation' })).toBeEnabled();
    await expect.poll(() => guests.map(({ id }) => lobbyViews.get(id))).toEqual(guests.map(() => expect.objectContaining({
      firstPlayerId: guests[1].id, allySeries: null, canSelectAllySeries: false,
    })));
    await page.getByRole('button', { name: 'Lancer la préparation' }).click();
    await expect(page.getByRole('heading', { name: 'Préparation de la partie' })).toBeFocused();
    await expect(seriesPanel(page).getByRole('status')).toHaveText('Série non choisie');
    await expect(seriesPanel(page).locator('button, select')).toHaveCount(0);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
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
    const resources: [string, number][] = [
      ['Camille (siège 1) — Alice', 0], ['Invité 1 (siège 2) — Chapelier fou', 0], ['Invité 2 (siège 3) — Reine de cœur', 0],
      ['Invité 3 (siège 4) — Jabberwocky', count === 5 ? 7 : 6], ['Invité 4 (siège 5) — Chat du Cheshire', 0],
    ];
    await checkFirstTea(page, expected);
    await checkIndividualResources(page, resources.slice(0, count));
    await expect.poll(() => preparedViews.size).toBe(count - 1);
    const [firstGuest, secondGuest] = guests;
    const { hostId, preparation: shared } = preparedViews.get(firstGuest.id)!;
    expect(shared?.firstTeaPreview).toEqual([...guests.slice(1).map(({ id }) => id), hostId, firstGuest.id]
      .map((playerId, i) => ({ playerId, turn: i + 1, plannedShards: shards[i] })));
    expect(shared?.twoPlayerSetup).toBeNull();
    expect(shared?.initialBets).toBeNull();
    expect(shared?.initialLeaders).toBeNull();
    await checkNoLateSetup(page);
    expect(shared?.firstBattle).toEqual({ dieResult: 2, region: { id: garden.id, name: garden.name } });
    // Liste exacte : les zones de jetons ne livrent que des nombres, même au propriétaire du sac.
    const expectedResources = [hostId, ...guests.map(({ id }) => id)].map((playerId, i) => ({
      playerId, faction: FACTION_IDS[i], boardFace: 'ordinary',
      supportersInReserve: 10, supportersOnThirdForgeTrack: 4, castlesInReserve: 5,
      artifactsOnForge: 4, coveredAbilities: 4, leaderStrength: 1, shield: 'intact',
      victoryPoints: 0, combat: 0, bagTokenCount: 10, poisonInReserve: resources[i][1],
      activeTokenCount: 0, exhaustedTokenCount: 0, madnessTrackTokenCount: 0,
    }));
    const ownTitles = ['Remporter le croquet du Jardin', 'Se lier d’amitié avec tous'];
    await expect(questPanel(page).getByRole('heading', { level: 4 })).toHaveText(ownTitles);
    const distinctTitles = new Set(ownTitles);
    for (const { id } of guests) {
      const view = preparedViews.get(id);
      expect(view).toMatchObject({ allySeries: null, canSelectAllySeries: false });
      const preparation = view?.preparation;
      expect(preparation).toEqual({ ...shared, initialQuest: preparation?.initialQuest });
      expect(preparation?.individualResources).toStrictEqual(expectedResources);
      const offer = preparation?.initialQuest;
      if (offer?.type !== 'offer') throw new Error('Offre privée absente');
      expect(offer.cards).toHaveLength(2);
      for (const { title } of offer.cards) {
        distinctTitles.add(title);
        await expect(page.getByText(title, { exact: true })).toHaveCount(0);
      }
    }
    expect(distinctTitles.size).toBe(2 * count);

    clients[1].disconnect();
    await page.reload();
    await expect(seriesPanel(page).getByRole('status')).toHaveText('Série non choisie');
    await checkFirstTea(page, expected);
    await checkIndividualResources(page, resources.slice(0, count));
    await checkFirstBattle(page, garden);
    await checkNoLateSetup(page);
    const returned: Socket<ServerEvents, ClientEvents> = io(url, { forceNew: true, ackTimeout: 2000, transports: ['websocket'] });
    clients.push(returned);
    returned.on('lobby:update', recordPreparation);
    const resumed = success(await returned.emitWithAck('lobby:resume', secondGuest.session));
    expect(resumed).toEqual(preparedViews.get(secondGuest.id));
    expect(resumed).toMatchObject({ allySeries: null, canSelectAllySeries: false });
    expect(resumed.preparation?.individualResources).toStrictEqual(expectedResources);
    for (const [i, { id, session }] of guests.entries()) {
      if (i === 1) continue; // Already checked on a replacement connection above.
      expect(success(await clients[i].emitWithAck('lobby:resume', session))).toEqual(preparedViews.get(id));
    }
    await expect(questPanel(page).getByRole('heading', { level: 4 })).toHaveText(ownTitles);

    const guestSockets = clients.slice(0, count - 1).map((socket, i) => i === 1 ? returned : socket);
    const updates = guestSockets.map((socket) => {
      const events: string[] = [];
      socket.onAny((name) => events.push(name));
      return events;
    });
    await Promise.all(guestSockets.map(async (socket, i) => {
      const offer = preparedViews.get(guests[i].id)?.preparation?.initialQuest;
      if (offer?.type !== 'offer') throw new Error('Offre privée absente');
      const receipt = success(await socket.emitWithAck('setup-quest:choose', {
        type: 'submit-decision', actionId: randomUUID(), expectedRevision: 0,
        params: { decisionId: offer.decisionId, optionId: offer.cards[0].optionId },
      }));
      expect(receipt.revision).toBe(1);
    }));
    await expect(questPanel(page).getByRole('heading', { level: 4 })).toHaveText(ownTitles);
    await checkNoLateSetup(page);
    await checkFirstTea(page, expected);
    await questPanel(page).getByRole('button', { name: `Garder « ${ownTitles[0]} »` }).click();
    await expect(questPanel(page).getByRole('status')).toContainText('Choix enregistré');
    const checkHand = async () => {
      await expect(betsPanel(page).getByRole('listitem')).toHaveText(FACTION_IDS.slice(1, count).map((id) => FACTION_NAMES[id]));
      await expect(betsPanel(page).getByRole('button')).toHaveCount(0);
    };
    const leaderNames = ['Camille', ...guests.map((_, i) => `Invité ${i + 1}`)];
    const leaderCodes = ['AL', 'CF', 'RC', 'JA', 'CC'];
    const leaders: [string, string][] = FACTION_IDS.slice(0, count).map((faction, i) => [`${leaderNames[i]} — ${FACTION_NAMES[faction]}`, leaderCodes[i]]);
    const initialLeaders = { zone: 'end-of-table', leaders: [hostId, ...guests.map(({ id }) => id)]
      .map((playerId, i) => ({ playerId, faction: FACTION_IDS[i] })) };
    await checkHand();
    await checkPhaseReference(page);
    await checkLeaders(page, leaders);
    await expect(shardsWaiting(page)).toBeVisible();
    await checkFirstTea(page, expected);
    for (const [i, socket] of guestSockets.entries()) {
      const view = success(await socket.emitWithAck('lobby:resume', guests[i].session));
      expect(view).toEqual(preparedViews.get(guests[i].id));
      expect(view.preparation?.initialQuest.type).toBe('kept');
      expect(view.preparation?.initialBets).toEqual(FACTION_IDS.slice(0, count).filter((_, j) => j !== i + 1));
      expect(view.preparation?.initialLeaders).toStrictEqual(initialLeaders);
      expect(view.preparation?.firstTeaPreview).toEqual(shared?.firstTeaPreview);
      expect(updates[i]).toEqual(['setup-quest:update', 'lobby:update']);
    }
    await page.reload();
    await expect(questPanel(page).getByRole('heading', { level: 4 })).toHaveText([ownTitles[0]]);
    await checkHand();
    await checkPhaseReference(page);
    await checkLeaders(page, leaders);
    await expect(shardsWaiting(page)).toBeVisible();
    await checkFirstTea(page, expected);
    await expect(page.getByText(/Le premier Thé n’a pas commencé/)).toBeVisible();
    expect(draws).toBe(35 + count * 9 + Array.from({ length: count }, (_, i) => 30 - 2 * count + i).reduce((a, b) => a + b));
  } finally {
    for (const client of clients) client.disconnect();
    await server.close();
  }
}

const firefoxTest = test.extend({ browserName: 'firefox' });
for (const [browser, browserTest] of [['Chromium', test], ['Firefox', firefoxTest]] as const) {
  for (const count of [3, 4, 5]) {
    browserTest(`${browser} : ${count} sièges dont ${count - 1} simulés, Quêtes et Paris privés, aides, Chefs et Éclats prévus`,
      async ({ page }) => checkMultiseatSetup(page, count));
  }
}
