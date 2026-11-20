import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { assignRegionScoreMarkers, createLobby, launchPreparation, resolveTwoPlayerRegionSetup, viewFor } from '@wonderland/game-engine';
import { REGION_CATALOG } from '@wonderland/shared';
import { getSetupQuestV1, lobbyState, SETUP_QUEST_CATALOG_V1 } from '@wonderland/shared/lobby-storage';
import { INITIAL_QUEST_TEXT_V1 } from '../packages/game-engine/src/initial-quest-text-v1.ts';

const { quests } = SETUP_QUEST_CATALOG_V1;

it('fige les 30 identifiants et Régions du relevé web, avec des titres FR seulement', () => {
  const [donjon, foret, jardin, mare, comte] = REGION_CATALOG.clockwise;
  expect(quests.map(({ id }) => id)).toEqual(Array.from({ length: 30 }, (_, i) => `quest-${31000 + i}`));
  expect(quests.map(({ exploitRegionId }) => exploitRegionId)).toEqual([
    ...[jardin, mare, donjon, foret, comte].flatMap((region) => Array(5).fill(region)),
    foret, comte, mare, donjon, jardin,
  ]);
  expect(new Set(quests.map(({ title }) => title)).size).toBe(30);
  for (const quest of quests) {
    expect(Object.keys(quest).sort()).toEqual(['exploitRegionId', 'id', 'title']);
    expect(quest.title.trim()).toMatch(/\S/);
    expect(getSetupQuestV1(quest.id)).toBe(quest);
  }
  expect((['quest-31000', 'quest-31016', 'quest-31018', 'quest-31022'] as const).map(getSetupQuestV1).map(({ title }) => title))
    .toEqual(['Peindre les roses', 'Appel aux palourdes', 'Les belles et les bêtes', 'Le château changeur']);
});

it('associe les deux reformulations et conserve les cinq avertissements du relevé', () => {
  expect(Object.keys(INITIAL_QUEST_TEXT_V1)).toEqual(quests.map(({ id }) => id));
  for (const [exploit, objective] of Object.values(INITIAL_QUEST_TEXT_V1)) {
    expect(exploit).toMatch(/\S/);
    expect(objective).toMatch(/\S/);
  }
  expect(Object.entries(INITIAL_QUEST_TEXT_V1).filter(([, text]) => text[2]).map(([id]) => id))
    .toEqual(['quest-31019', 'quest-31024', 'quest-31025', 'quest-31028', 'quest-31029']);
});

it.each([quests[1], quests[5], quests[10], quests[15], quests[20]])('mélange après les marqueurs et retire $exploitRegionId sans réattribution', (wanted) => {
  const host = { id: randomUUID(), name: 'Camille', ready: true, faction: 'alice' as const };
  const guest = { id: randomUUID(), name: 'Dinah', ready: true, faction: 'chapelier-fou' as const };
  const open = { ...createLobby('12345678', host), players: [host, guest], firstPlayerId: guest.id };
  const index = quests.indexOf(wanted);
  let call = 0;
  const random = vi.fn(() => {
    const step = call++;
    // The score shuffle rotates left, then the quest shuffle swaps just the chosen quest to the top.
    if (step === 34) return 0.5; // The die (index 3 → 2) follows the quest shuffle and precedes both bag shuffles.
    return step < 5 || step === 5 + 29 - index ? 0 : 0.999;
  });
  const reply = launchPreparation(open, host.id, open.revision, randomUUID, random);
  if (!reply.ok) throw new Error(reply.error);
  const state = lobbyState.parse(reply.value);
  const expected = [...quests];
  [expected[0], expected[index]] = [expected[index], expected[0]];
  const scores = state.regionScores!;
  expect(scores).toEqual(assignRegionScoreMarkers({ playerCount: 2 }, () => 0));
  const result = resolveTwoPlayerRegionSetup({ shuffledQuestDeck: expected, initialRegionScores: scores });
  const excluded = wanted.exploitRegionId;
  expect(state.firstBattleRoll).toEqual({ dieVersion: 1, result: 2 });
  expect(result.revealedQuest).toBe(wanted);
  const { deck, seats, twoPlayerOut } = state.initialQuests!;
  expect(twoPlayerOut).toEqual({ revealed: wanted.id,
    removed: expected.filter((quest) => quest !== wanted && quest.exploitRegionId === excluded).map(({ id }) => id) });
  expect([...seats.flatMap((seat) => seat.type === 'offer' ? seat.cards : [seat.card]), ...deck])
    .toEqual(expected.filter((quest) => quest.exploitRegionId !== excluded).map(({ id }) => id));
  expect(new Set([...result.excludedQuests, ...result.remainingQuestDeck])).toEqual(new Set(quests));
  expect([...result.regionScores.placements, result.regionScores.excludedPlacement, result.regionScores.storedMarkerId])
    .toEqual([...scores.placements.filter(({ regionId }) => regionId !== excluded),
      scores.placements.find(({ regionId }) => regionId === excluded), scores.storedMarkerId]);
  for (const player of [host, guest]) {
    const preparation = viewFor(state, player.id).preparation!;
    expect(preparation.twoPlayerSetup).toEqual({ revealedQuestTitle: wanted.title, excludedRegion: { id: excluded, name: REGION_CATALOG.names[excluded] } });
    expect(preparation.regionScores.placements.map(({ regionId }) => regionId)).toEqual(REGION_CATALOG.clockwise.filter((id) => id !== excluded));
    expect(preparation.firstBattle.dieResult).toBe(2);
    expect(preparation.firstBattle.region.id).not.toBe(excluded);
    if (excluded === 'donjon-rouge') {
      expect(preparation.firstBattle.region).toEqual({ id: 'mare-de-larmes', name: 'Mare de Larmes' });
    }
  }
  expect(random).toHaveBeenCalledTimes(35 + 2 * 10); // Common setup, then 10 swaps per 11-token bag.
});
