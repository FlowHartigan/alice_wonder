import { z } from 'zod';
import { lobbyWithScores, validInitialPreparation } from './index.ts';
import { twoPlayerSetupSnapshot } from './setup-quests-v1.ts';

export * from './setup-quests-v1.ts';

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

export const lobbyState = lobbyWithRegionalSetup.safeExtend({
  version: z.literal(7), firstBattleRoll: firstBattleRoll.nullable(),
}).refine(({ firstBattleRoll, game }) => (firstBattleRoll === null) === (game === null), {
  message: 'Lancer de Premier combat requis uniquement en préparation lancée', path: ['firstBattleRoll'],
});
export type LobbyState = z.infer<typeof lobbyState>;
