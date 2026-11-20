import { gameState } from '@wonderland/shared';
import type { GamePhase } from '@wonderland/shared';
import { firstTeaForSetup } from './game.ts';

/** Counts of physical pieces, indexed by denomination. */
type ShardPieces = Readonly<{ 1: number; 5: number }>;
type ShardSnapshot = Readonly<{
  bank: ShardPieces;
  balances: readonly Readonly<{ playerId: string; pieces: ShardPieces }>[];
}>;

type PendingStartingShards = Readonly<{
  status: 'pending';
  phase: GamePhase;
  playerIds: readonly string[];
  firstPlayerId: string | null;
  stepsJThroughMComplete: boolean;
  commonSetupReady: boolean;
}>;

type ResolvedStartingShards = Readonly<{
  status: 'resolved';
  before: ShardSnapshot;
  after: ShardSnapshot;
}>;

const pieces = (ones: number, fives: number): ShardPieces => Object.freeze({ 1: ones, 5: fives });
const initialBank = pieces(30, 10);

/** WW-SETUP-005, round I, step N. Replay accepts only the already acquired engine result. */
export function transferStartingShards(state: PendingStartingShards | ResolvedStartingShards): ResolvedStartingShards | null {
  if (state.status === 'resolved') return state;
  if (state.stepsJThroughMComplete !== true || state.commonSetupReady !== true) return null;

  const { playerIds, firstPlayerId } = state;
  if (!gameState.shape.playerIds.safeParse(playerIds).success || new Set(playerIds).size !== playerIds.length) return null;
  const order = firstTeaForSetup(state, firstPlayerId);
  if (!order) return null;

  const spent = order.reduce((total, { plannedShards }) => total + plannedShards, 0);
  return Object.freeze({
    status: 'resolved',
    before: Object.freeze({
      bank: initialBank,
      balances: Object.freeze(order.map(({ playerId }) => Object.freeze({ playerId, pieces: pieces(0, 0) }))),
    }),
    after: Object.freeze({
      bank: pieces(initialBank[1] - spent, initialBank[5]),
      balances: Object.freeze(order.map(({ playerId, plannedShards }) => Object.freeze({ playerId, pieces: pieces(plannedShards, 0) }))),
    }),
  });
}
