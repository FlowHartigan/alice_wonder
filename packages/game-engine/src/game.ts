import { gameAction } from '@wonderland/shared';
import type { GamePhase, GameState, PrivateGameEvent, PrivatePlayerView, PublicGameView } from '@wonderland/shared';

/** Server context resolved from an authenticated session, never from the command. */
export type GameSeat = Readonly<{ gameId: string; playerId: string }>;

type Receipt = { revision: number; event: PrivateGameEvent };
type GameActionResult =
  | { ok: true; state: GameState; changed: boolean; receipt: Receipt }
  | { ok: false; error: 'unauthorized' | 'invalid' | 'conflict' | 'decision-unavailable' | 'wrong-phase' };

function actorIn(state: GameState, seat: GameSeat | undefined): string | undefined {
  return seat?.gameId === state.gameId && state.playerIds.includes(seat.playerId) ? seat.playerId : undefined;
}

function samePhase(a: GamePhase, b: GamePhase): boolean {
  return a.type === b.type && (a.type === 'setup' || (b.type !== 'setup' && a.round === b.round));
}

function eventView({ decisionId, optionId }: PrivateGameEvent): PrivateGameEvent {
  return { type: 'decision-submitted', decisionId, optionId };
}

export function applyGameAction(state: GameState, seat: GameSeat | undefined, raw: unknown): GameActionResult {
  const actorId = actorIn(state, seat);
  if (!actorId) return { ok: false, error: 'unauthorized' };
  const parsed = gameAction.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const action = parsed.data;

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

export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Source aléatoire hors de [0, 1)');
    const j = Math.floor(value * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
