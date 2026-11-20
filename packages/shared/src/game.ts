import { z } from 'zod';

// One spelling per UUID before checking uniqueness, membership or replay keys.
const id = z.uuid().refine((value) => value === value.toLowerCase(), { message: 'UUID attendu en minuscules' });
const round = z.literal([1, 2, 3]);
export const gamePhase = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('setup') }),
  z.strictObject({ type: z.literal('tea'), round }),
  z.strictObject({ type: z.literal('war'), round }),
]);

// A decision records options already authorized by a rule, not the effects of that rule.
const pendingDecision = z.strictObject({
  id, actorId: id, phase: gamePhase,
  optionIds: z.array(id).nonempty().refine((ids) => new Set(ids).size === ids.length),
});
export const gameAction = z.strictObject({
  actionId: id,
  expectedRevision: z.int().nonnegative(),
  type: z.literal('submit-decision'),
  params: z.strictObject({ decisionId: id, optionId: id }),
});
const privateEvent = z.strictObject({
  type: z.literal('decision-submitted'), decisionId: id, optionId: id,
});

export const gameState = z.strictObject({
  version: z.literal(1),
  gameId: id,
  revision: z.int().nonnegative(),
  phase: gamePhase,
  playerIds: z.array(id).min(2).max(5),
  decisions: z.array(pendingDecision),
  history: z.array(z.strictObject({ actorId: id, action: gameAction, event: privateEvent })),
}).refine(({ playerIds, decisions, history, revision }) => {
  const seats = new Set(playerIds);
  const decisionsSeen = new Set<string>();
  const actionKeys = new Set<string>();
  const actorRevisions = new Map<string, number>();
  for (const decision of decisions) {
    if (!seats.has(decision.actorId) || decisionsSeen.has(decision.id)) return false;
    decisionsSeen.add(decision.id);
  }
  for (const { actorId, action, event } of history) {
    const key = `${actorId}:${action.actionId}`;
    if (!seats.has(actorId) || decisionsSeen.has(event.decisionId) || actionKeys.has(key)) return false;
    if (action.params.decisionId !== event.decisionId || action.params.optionId !== event.optionId) return false;
    const previousRevision = actorRevisions.get(actorId) ?? 0;
    if (action.expectedRevision !== previousRevision) return false;
    actorRevisions.set(actorId, previousRevision + 1);
    decisionsSeen.add(event.decisionId);
    actionKeys.add(key);
  }
  return seats.size === playerIds.length && revision >= history.length;
}, { message: 'Identités, décisions ou historique de partie incohérents' });

export type GameState = z.infer<typeof gameState>;
export type GamePhase = z.infer<typeof gamePhase>;
export type GameAction = z.infer<typeof gameAction>;
export type PrivateGameEvent = z.infer<typeof privateEvent>;
export type GameReceipt = { revision: number; event: PrivateGameEvent };

// Intentionally not derived from the snapshot: adding a stored field never publishes it.
export type PublicGameView = { gameId: string; phase: GamePhase; playerIds: string[] };
export type PrivatePlayerView = {
  public: PublicGameView;
  you: string;
  revision: number;
  decisions: { id: string; optionIds: string[] }[];
  events: PrivateGameEvent[];
};
