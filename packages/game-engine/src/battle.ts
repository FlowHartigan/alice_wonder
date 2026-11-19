import type { GamePhase } from '@wonderland/shared';

type HumanCombatant = Readonly<{
  status: 'in-contention' | 'withdrawn' | 'failed';
  strength: number;
}>;

export type TwoPlayerDrawStopSnapshot = Readonly<{
  /** Total number of players in the game, not the number in this battle. */
  gamePlayerCount: number;
  round: Extract<GamePhase, { type: 'war' }>['round'];
  /** False before the first draw and until all of its effects have resolved. */
  firstDrawFullyResolved: boolean;
  /** Human participants only; local Resistance is not a combatant. */
  humanCombatants: readonly HumanCombatant[];
}>;

const resistanceByRound = { 1: 3, 2: 5, 3: 7 } satisfies Record<TwoPlayerDrawStopSnapshot['round'], number>;

/** WW-WAR-004 (FR special case only). False does not authorize another draw. */
export function triggersTwoPlayerDrawStop({
  gamePlayerCount, round, firstDrawFullyResolved, humanCombatants,
}: TwoPlayerDrawStopSnapshot): boolean {
  if (gamePlayerCount !== 2 || !firstDrawFullyResolved) return false;

  const inContention = humanCombatants.filter(({ status }) => status === 'in-contention');
  return inContention.length === 1 && inContention[0].strength >= resistanceByRound[round];
}
