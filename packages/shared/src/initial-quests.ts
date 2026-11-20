import { z } from 'zod';
import type { GameState } from './game.ts';
import { getSetupQuestV1, questId, SETUP_QUEST_CATALOG_V1 } from './setup-quests-v1.ts';
import type { QuestId } from './setup-quests-v1.ts';

export const initialQuestsSnapshot = z.strictObject({
  catalogVersion: z.literal(SETUP_QUEST_CATALOG_V1.version),
  deck: z.array(questId).max(30), // Top at index 0.
  seats: z.array(z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('offer'), cards: z.tuple([questId, questId]) }),
    z.strictObject({ type: z.literal('kept'), card: questId }),
  ])).min(2).max(5), // Indices are the frozen game seat order.
  twoPlayerOut: z.strictObject({ revealed: questId, removed: z.array(questId).max(29) }).nullable(),
});
export type InitialQuestsSnapshot = z.infer<typeof initialQuestsSnapshot>;

// Stable game-scoped UUID aliases, not secrets. Authorization uses the actor's pending decision.
// The catalogue suffix is unique in v1; no second card inventory is stored in decisions/history.
export function questOptionId(gameId: string, card: QuestId) {
  return `${gameId.slice(0, -2)}${card.slice(-2)}`;
}

export function matchesInitialQuests(game: GameState | null, quests: InitialQuestsSnapshot | null) {
  if (!game || !quests) return game === null && quests === null;
  const { twoPlayerOut, seats, deck } = quests;
  if (seats.length !== game.playerIds.length || Boolean(twoPlayerOut) !== (seats.length === 2)) return false;
  const active = [...deck, ...seats.flatMap((seat) => seat.type === 'offer' ? seat.cards : [seat.card])];
  const removed = twoPlayerOut ? [twoPlayerOut.revealed, ...twoPlayerOut.removed] : [];
  const all = [...active, ...removed];
  if (all.length !== SETUP_QUEST_CATALOG_V1.quests.length || new Set(all).size !== all.length) return false;
  if (twoPlayerOut) {
    const region = getSetupQuestV1(twoPlayerOut.revealed).exploitRegionId;
    const inRegion = (id: QuestId) => getSetupQuestV1(id).exploitRegionId === region;
    if (!removed.every(inRegion) || active.some(inRegion)) return false;
  }

  const keptCount = seats.filter((seat) => seat.type === 'kept').length;
  return game.revision === keptCount && game.history.length === keptCount
    && game.decisions.length === seats.length - keptCount
    && seats.every((seat, index) => {
      const actorId = game.playerIds[index];
      if (seat.type === 'kept') return game.history.some((entry) => entry.actorId === actorId
        && entry.event.decisionId === actorId && entry.event.optionId === questOptionId(game.gameId, seat.card));
      return game.decisions.some((decision) => decision.actorId === actorId && decision.id === actorId
        && decision.phase.type === 'setup' && decision.optionIds.length === seat.cards.length
        && seat.cards.every((card, i) => decision.optionIds[i] === questOptionId(game.gameId, card)));
    });
}
