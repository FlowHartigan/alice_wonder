import { REGION_CATALOG } from '@wonderland/shared';
import type { GameState, InitialQuestView, QuestTextView } from '@wonderland/shared';
import { getSetupQuestV1, questOptionId, SETUP_QUEST_CATALOG_V1 } from '@wonderland/shared/lobby-storage';
import type { InitialQuestsSnapshot, LobbyState, QuestId } from '@wonderland/shared/lobby-storage';
import { applyGameAction, privatePlayerView, shuffle } from './game.ts';
import type { RandomSource } from './game.ts';
import { INITIAL_QUEST_TEXT_V1 } from './initial-quest-text-v1.ts';
import { resolveTwoPlayerRegionSetup } from './two-player-region-setup.ts';

export function shuffleSetupQuestIds(random: RandomSource): QuestId[] {
  return shuffle(SETUP_QUEST_CATALOG_V1.quests.map(({ id }) => id), random);
}

export function questSupply(order: QuestId[], playerCount: number, scores: NonNullable<LobbyState['regionScores']>) {
  if (playerCount !== 2) return { deck: order, twoPlayerOut: null };
  const setup = resolveTwoPlayerRegionSetup({ shuffledQuestDeck: order.map(getSetupQuestV1), initialRegionScores: scores });
  return {
    deck: setup.remainingQuestDeck.map(({ id }) => id),
    twoPlayerOut: {
      revealed: setup.revealedQuest.id,
      removed: setup.excludedQuests.filter((quest) => quest !== setup.revealedQuest).map(({ id }) => id),
    },
  };
}

/** WW-SETUP-003 J: two consecutive cards per seat, in the frozen roster order, after A–I. */
export function dealInitialQuests(game: GameState, supply: Pick<InitialQuestsSnapshot, 'deck' | 'twoPlayerOut'>) {
  const seats = game.playerIds.map((_, i): Extract<InitialQuestsSnapshot['seats'][number], { type: 'offer' }> => ({
    type: 'offer', cards: [supply.deck[2 * i], supply.deck[2 * i + 1]],
  }));
  const decisions = seats.map(({ cards }, i) => ({
    id: game.playerIds[i], actorId: game.playerIds[i], phase: game.phase,
    optionIds: cards.map((id) => questOptionId(game.gameId, id)),
  }));
  return {
    game: { ...game, decisions },
    initialQuests: {
      catalogVersion: SETUP_QUEST_CATALOG_V1.version, twoPlayerOut: supply.twoPlayerOut,
      deck: supply.deck.slice(seats.length * 2), seats,
    },
  };
}

/** Consumes only authorized decisions. Replay returns the exact receipt without moving cards. */
export function chooseInitialQuest(state: LobbyState, actorId: string, raw: unknown, random: RandomSource) {
  const { game, initialQuests } = state;
  if (!state.players.some(({ id }) => id === actorId)) return { ok: false, error: 'unauthorized' } as const;
  if (!game || !initialQuests || game.phase.type !== 'setup') return { ok: false, error: 'wrong-phase' } as const;
  const result = applyGameAction(game, { gameId: game.gameId, playerId: actorId }, raw);
  if (!result.ok) return result;
  const { receipt, changed } = result;
  if (!changed) return { ok: true, state, changed, receipt } as const;

  const index = game.playerIds.indexOf(actorId);
  const seat = initialQuests.seats[index];
  if (seat.type !== 'offer') throw new Error('Offre initiale absente pour la décision');
  const [first, second] = seat.cards;
  const [kept, returned] = receipt.event.optionId === questOptionId(game.gameId, first) ? [first, second] : [second, first];
  const seats = [...initialQuests.seats];
  seats[index] = { type: 'kept', card: kept };
  // Return before shuffling immediately; no other offer is drawn again.
  const deck = shuffle([...initialQuests.deck, returned], random);
  return {
    ok: true, changed, receipt,
    state: { ...state, game: result.state, initialQuests: { ...initialQuests, seats, deck } },
  } as const;
}

/** Gate for the future transition K; completing J does not execute it or publish a status. */
export function isReadyForSetupK({ game, initialQuests }: LobbyState): boolean {
  return game?.phase.type === 'setup' && initialQuests?.seats.every((seat) => seat.type === 'kept') === true;
}

function questText(id: QuestId): QuestTextView {
  const { title, exploitRegionId } = getSetupQuestV1(id);
  const [exploit, objective, toConfirm] = INITIAL_QUEST_TEXT_V1[id];
  return { title, regionName: REGION_CATALOG.names[exploitRegionId], exploit, objective, ...(toConfirm ? { toConfirm } : {}) };
}

export function initialQuestFor({ game, initialQuests }: LobbyState, playerId: string): InitialQuestView | undefined {
  if (!game || !initialQuests) return;
  const player = privatePlayerView(game, { gameId: game.gameId, playerId });
  if (!player) return;
  const gameId = game.gameId;
  const seat = initialQuests.seats[game.playerIds.indexOf(playerId)];
  if (seat.type === 'kept') return { gameId, type: 'kept', revision: 1, card: questText(seat.card) };
  const [decision] = player.decisions;
  return { gameId, type: 'offer', revision: 0, decisionId: decision.id,
    cards: seat.cards.map((id, i) => ({ ...questText(id), optionId: decision.optionIds[i] })) };
}
