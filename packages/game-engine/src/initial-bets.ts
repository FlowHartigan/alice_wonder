import type { FactionId } from '@wonderland/shared';
import type { LobbyState } from '@wonderland/shared/lobby-storage';
import { isReadyForSetupK } from './initial-quests.ts';

/** WW-SETUP-003 K / WW-COUNT-001/002. Project from the validated frozen roster, not turn order. */
export function initialBetsFor(state: LobbyState, playerId: string): FactionId[] | null {
  const { game, players } = state;
  if (!game?.playerIds.includes(playerId) || !isReadyForSetupK(state)) return null;
  if (game.playerIds.length === 2) return [];
  return game.playerIds.filter((id) => id !== playerId).map((id) => {
    const faction = players.find((player) => player.id === id)?.faction;
    if (!faction) throw new Error('Faction absente du roster figé');
    return faction;
  });
}
