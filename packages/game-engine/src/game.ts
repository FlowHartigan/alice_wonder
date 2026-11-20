import { gameAction, gameState } from '@wonderland/shared';
import type { FirstTeaSetupView, GamePhase, GameState, PrivateGameEvent, PrivatePlayerView, PublicGameView, TeaTableSetupView } from '@wonderland/shared';

/** Server context resolved from an authenticated session, never from the command. */
export type GameSeat = Readonly<{ gameId: string; playerId: string }>;

type Receipt = { revision: number; event: PrivateGameEvent };
type GameActionResult =
  | { ok: true; state: GameState; changed: boolean; receipt: Receipt }
  | { ok: false; error: 'unauthorized' | 'invalid' | 'conflict' | 'decision-unavailable' | 'wrong-phase' };

export function initializeGame(gameId: string, playerIds: string[]): GameState {
  return gameState.parse({
    version: 1, gameId, playerIds, revision: 0, phase: { type: 'setup' }, decisions: [], history: [],
  });
}

/** WW-SETUP-004 (étape 7), WW-COUNT-001/002. Excludes the Bout de Table and the deck space. */
export function teaTableForSetup({ playerIds }: GameState): TeaTableSetupView {
  const activeBlockers: TeaTableSetupView['activeBlockers'] = [];
  if (playerIds.length < 4) activeBlockers.push('4J');
  if (playerIds.length < 5) activeBlockers.push('5J');
  return { openChairs: 13 - activeBlockers.length, activeBlockers };
}

// WW-SETUP-005 — livret FR p. 3, p. 5 N (tableau), p. 6 et 11.
const STARTING_SHARDS = {
  2: [2, 1],
  3: [3, 2, 1],
  4: [3, 2, 2, 1],
  5: [3, 2, 2, 1, 0],
} as const;

/** Uses the frozen seat order of a validated GameState, without applying step N. */
export function firstTeaForSetup(
  { phase, playerIds }: { phase: GamePhase; playerIds: readonly string[] }, firstPlayerId: string | null,
): FirstTeaSetupView | null {
  const count = playerIds.length;
  if (phase.type !== 'setup' || firstPlayerId === null || (count !== 2 && count !== 3 && count !== 4 && count !== 5)) return null;
  const start = playerIds.indexOf(firstPlayerId);
  if (start === -1) return null;
  return STARTING_SHARDS[count].map((plannedShards, index) => ({
    playerId: playerIds[(start + index) % count], turn: index + 1, plannedShards,
  }));
}

// In a validated snapshot, exact membership also rejects non-canonical session IDs.
function actorIn(state: GameState, seat: GameSeat | undefined): string | undefined {
  return seat?.gameId === state.gameId && state.playerIds.includes(seat.playerId) ? seat.playerId : undefined;
}

function samePhase(a: GamePhase, b: GamePhase): boolean {
  return a.type === b.type && (a.type === 'setup' || (b.type !== 'setup' && a.round === b.round));
}

function eventView({ decisionId, optionId }: PrivateGameEvent): PrivateGameEvent {
  return { type: 'decision-submitted', decisionId, optionId };
}

/** Expects authoritative state validated with gameState at creation or restoration. */
export function applyGameAction(state: GameState, seat: GameSeat | undefined, raw: unknown): GameActionResult {
  const actorId = actorIn(state, seat);
  if (!actorId) return { ok: false, error: 'unauthorized' };
  const parsed = gameAction.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const action = parsed.data;

  // Only successes bind a key; replay them before checking current revision and phase.
  const history = state.history.filter((entry) => entry.actorId === actorId);
  const replayIndex = history.findIndex((entry) => entry.action.actionId === action.actionId);
  if (replayIndex !== -1) {
    const previous = history[replayIndex];
    const same = previous.action.expectedRevision === action.expectedRevision
      && previous.action.type === action.type
      && previous.action.params.decisionId === action.params.decisionId
      && previous.action.params.optionId === action.params.optionId;
    return same
      ? { ok: true, state, changed: false, receipt: { revision: replayIndex + 1, event: eventView(previous.event) } }
      : { ok: false, error: 'conflict' };
  }

  if (action.expectedRevision !== history.length) return { ok: false, error: 'conflict' };
  const { decisionId, optionId } = action.params;
  const decision = state.decisions.find((candidate) => candidate.actorId === actorId && candidate.id === decisionId);
  if (!decision) return { ok: false, error: 'decision-unavailable' };
  if (!samePhase(state.phase, decision.phase)) return { ok: false, error: 'wrong-phase' };
  if (!decision.optionIds.includes(optionId)) return { ok: false, error: 'invalid' };

  const event: PrivateGameEvent = { type: 'decision-submitted', decisionId, optionId };
  return {
    ok: true,
    changed: true,
    state: {
      ...state,
      revision: state.revision + 1,
      decisions: state.decisions.filter((candidate) => candidate !== decision),
      history: [...state.history, { actorId, action, event }],
    },
    receipt: { revision: history.length + 1, event: eventView(event) },
  };
}

export function publicGameView({ gameId, phase, playerIds }: GameState): PublicGameView {
  return {
    gameId,
    phase: phase.type === 'setup' ? { type: 'setup' } : { type: phase.type, round: phase.round },
    playerIds: [...playerIds],
  };
}

export function privatePlayerView(state: GameState, seat: GameSeat | undefined): PrivatePlayerView | undefined {
  const actorId = actorIn(state, seat);
  if (!actorId) return undefined;
  const events = state.history.filter((entry) => entry.actorId === actorId).map(({ event }) => eventView(event));
  return {
    public: publicGameView(state), you: actorId, revision: events.length, events,
    decisions: state.decisions
      .filter((decision) => decision.actorId === actorId && samePhase(state.phase, decision.phase))
      .map(({ id, optionIds }) => ({ id, optionIds: [...optionIds] })),
  };
}

/** Server-provided uniform values in [0, 1); the engine owns no implicit random source. */
export type RandomSource = () => number;

export function randomIndex(length: number, random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Source aléatoire hors de [0, 1)');
  return Math.floor(value * length);
}

export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
