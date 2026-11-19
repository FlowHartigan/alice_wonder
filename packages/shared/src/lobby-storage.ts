import { z } from 'zod';
import { lobbyWithScores, validInitialPreparation } from './index.ts';
import { twoPlayerSetupSnapshot } from './setup-quests-v1.ts';

export * from './setup-quests-v1.ts';

// Server-only entry point: the public client contract does not import the catalogue.
export const lobbyState = lobbyWithScores.extend({
  version: z.literal(6), twoPlayerSetup: twoPlayerSetupSnapshot.nullable(),
}).refine(validInitialPreparation, 'Sièges ou état de préparation incohérents')
  .refine(({ twoPlayerSetup, game, players }) => (
    (twoPlayerSetup !== null) === (game !== null && players.length === 2)
  ), 'Retrait régional incohérent avec la phase ou l’effectif')
  .refine(({ firstPlayerId, players }) => (
    firstPlayerId === null || players.some(({ id }) => id === firstPlayerId)
  ), { message: 'Le premier joueur doit avoir un siège dans le salon', path: ['firstPlayerId'] });
export type LobbyState = z.infer<typeof lobbyState>;
