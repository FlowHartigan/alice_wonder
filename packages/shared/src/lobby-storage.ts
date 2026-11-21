import { z } from 'zod';
import { allySeriesLetter, lobbyJournal, lobbyWithScores, validInitialPreparation, validPreparationWithScores } from './index.ts';
import { initialQuestsSnapshot, matchesInitialQuests } from './initial-quests.ts';
import { initialResourcesSnapshot, matchesStartingSeat, startingSeatResources } from './initial-resources.ts';
import { centralReservesSnapshot, centralReservesSnapshotV10, countInitialCentralReserves, matchesForgeReserve } from './central-reserves.ts';
import { twoPlayerSetupSnapshot } from './setup-quests-v1.ts';

export { countInitialCentralReserves, initialAllyStock, INITIAL_SHARD_BANK } from './central-reserves.ts';
export { STARTING_TOKEN_TYPES, startingSeatResources } from './initial-resources.ts';
export type { InitialResourcesSnapshot } from './initial-resources.ts';
export * from './setup-quests-v1.ts';
export { questOptionId } from './initial-quests.ts';
export type { InitialQuestsSnapshot } from './initial-quests.ts';

// Server-only entry point: the public client contract does not import internal setup data.
export const FIRST_BATTLE_DIE_VERSION = 1;
const firstBattleRoll = z.strictObject({ dieVersion: z.literal(FIRST_BATTLE_DIE_VERSION), result: z.literal([1, 2, 3]) });
export type FirstBattleRoll = z.infer<typeof firstBattleRoll>;

const lobbyWithRegionalSetup = lobbyWithScores.extend({
  twoPlayerSetup: twoPlayerSetupSnapshot.nullable(),
}).refine(validInitialPreparation, 'Sièges ou état de préparation incohérents')
  .refine(({ twoPlayerSetup, game, players }) => (
    (twoPlayerSetup !== null) === (game !== null && players.length === 2)
  ), 'Retrait régional incohérent avec la phase ou l’effectif')
  .refine(({ firstPlayerId, players }) => (
    firstPlayerId === null || players.some(({ id }) => id === firstPlayerId)
  ), { message: 'Le premier joueur doit avoir un siège dans le salon', path: ['firstPlayerId'] });

export const lobbySnapshotV6 = lobbyWithRegionalSetup.safeExtend({ version: z.literal(6) });
export type LobbySnapshotV6 = z.infer<typeof lobbySnapshotV6>;

const lobbyWithFirstBattle = lobbyWithRegionalSetup.safeExtend({
  firstBattleRoll: firstBattleRoll.nullable(),
}).refine(({ firstBattleRoll, game }) => (firstBattleRoll === null) === (game === null), {
  message: 'Lancer de Premier combat requis uniquement en préparation lancée', path: ['firstBattleRoll'],
});
export const lobbySnapshotV7 = lobbyWithFirstBattle.safeExtend({ version: z.literal(7) });
export type LobbySnapshotV7 = z.infer<typeof lobbySnapshotV7>;

const resourcesError = { message: 'Dotation initiale incohérente avec les sièges ou les zones', path: ['individualResources'] };
export const lobbySnapshotV8 = lobbyWithFirstBattle.safeExtend({
  version: z.literal(8), individualResources: initialResourcesSnapshot.nullable(),
}).refine(matchesResources, resourcesError);
export type LobbySnapshotV8 = z.infer<typeof lobbySnapshotV8>;

function matchesResources({ game, players, individualResources }: Pick<LobbySnapshotV7, 'game' | 'players'> & {
  individualResources: z.infer<typeof initialResourcesSnapshot> | null;
}) {
  if (!game) return individualResources === null;
  return individualResources !== null && individualResources.length === players.length
    && players.every(({ id, faction }, i) => faction !== null
      && matchesStartingSeat(individualResources[i], startingSeatResources(id, faction, players.length)));
}
function matchesFirstPlayer({ firstPlayerId, players }: Pick<LobbySnapshotV8, 'firstPlayerId' | 'players'>) {
  return firstPlayerId === null || players.some(({ id }) => id === firstPlayerId);
}

const lobbyWithInitialQuests = lobbyWithScores.extend({
  journal: lobbyJournal,
  firstBattleRoll: firstBattleRoll.nullable(),
  individualResources: initialResourcesSnapshot.nullable(), initialQuests: initialQuestsSnapshot.nullable(),
}).refine(validPreparationWithScores, 'Sièges ou état de préparation incohérents')
  .refine(matchesFirstPlayer, { message: 'Le premier joueur doit avoir un siège dans le salon', path: ['firstPlayerId'] })
  .refine(({ firstBattleRoll, game }) => (firstBattleRoll === null) === (game === null), {
    message: 'Lancer de Premier combat requis uniquement en préparation lancée', path: ['firstBattleRoll'],
  }).refine(matchesResources, resourcesError)
  .refine(({ game, initialQuests }) => matchesInitialQuests(game, initialQuests), {
    message: 'Zones ou décisions de Quêtes initiales incohérentes', path: ['initialQuests'],
  });
// Keep legacy event contracts strict even though the shared preparation refinements now accept v12 events.
const historicalJournal = lobbyWithScores.shape.journal;
export const lobbySnapshotV9 = lobbyWithInitialQuests.safeExtend({ version: z.literal(9), journal: historicalJournal });
export type LobbySnapshotV9 = z.infer<typeof lobbySnapshotV9>;

const reservesError = { message: 'Réserves centrales incohérentes avec les sacs ou la phase', path: ['centralReserves'] };
const lobbyWithCentralReserves = lobbyWithInitialQuests.safeExtend({
  centralReserves: centralReservesSnapshotV10.nullable(),
}).refine(({ individualResources, centralReserves }) => {
  // Other refinements already bind each whole bag to its unique frozen seat and the setup phase.
  if (!individualResources) return centralReserves === null;
  const { undistributedMadness } = countInitialCentralReserves(individualResources);
  return centralReserves !== null && centralReserves.undistributedMadness.single === undistributedMadness.single
    && centralReserves.undistributedMadness.double === undistributedMadness.double;
}, reservesError);
export const lobbySnapshotV10 = lobbyWithCentralReserves.safeExtend({ version: z.literal(10), journal: historicalJournal });
export type LobbySnapshotV10 = z.infer<typeof lobbySnapshotV10>;

const lobbyWithAllyStock = lobbyWithCentralReserves.safeExtend({
  centralReserves: centralReservesSnapshot.nullable(),
}).refine(({ individualResources, centralReserves }) => !individualResources || (centralReserves !== null
  && matchesForgeReserve(individualResources, centralReserves.forgeReserve)), reservesError);
export const lobbySnapshotV11 = lobbyWithAllyStock.safeExtend({ version: z.literal(11), journal: historicalJournal });
export type LobbySnapshotV11 = z.infer<typeof lobbySnapshotV11>;

export const lobbyState = lobbyWithAllyStock.safeExtend({
  version: z.literal(12), allySeries: allySeriesLetter.nullable(),
});
export type LobbyState = z.infer<typeof lobbyState>;
