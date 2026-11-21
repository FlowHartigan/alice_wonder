import { MAX_PLAYERS, MIN_PLAYERS } from '@wonderland/shared';
import type { TeaTableSetupView } from '@wonderland/shared';
import { shuffle, teaTableForPlayerCount } from './game.ts';
import type { RandomSource } from './game.ts';

const TEA_ROUNDS = [1, 2, 3] as const;
const TEA_DECK_SIZE = 30;

export type TeaCardInstance = Readonly<{ id: string; round: (typeof TEA_ROUNDS)[number] }>;
type TeaDecks = Readonly<Record<TeaCardInstance['round'], readonly TeaCardInstance[]>>;

export type InitialTeaSetupInput = Readonly<{ playerCount: number; decks: TeaDecks }>;

/** Internal domain data, not a public/network view. Only table placements are face up. */
export type InitialTeaSetup = Readonly<{
  table: Readonly<{
    openChairs: number;
    activeBlockers: readonly TeaTableSetupView['activeBlockers'][number][];
    placements: readonly Readonly<{ chairIndex: number; card: TeaCardInstance }>[];
  }>;
  reserves: TeaDecks;
}>;

/**
 * WW-SETUP-004 (steps 7–9), WW-COUNT-001/002. The caller supplies the frozen seat count
 * and the three complete decks. Validate before RNG, then shuffle I → II → III.
 * Chair indices are logical only: 0–10 common, 11 for 4J, 12 for 5J (not a physical circuit).
 */
export function prepareInitialTea(
  { playerCount, decks }: InitialTeaSetupInput, random: RandomSource,
): InitialTeaSetup {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new TypeError('Effectif incohérent pour la préparation du Thé');
  }
  if (!decks || typeof decks !== 'object' || Array.isArray(decks) || Reflect.ownKeys(decks).length !== TEA_ROUNDS.length) {
    throw new TypeError('La préparation du Thé exige les trois paquets I, II et III');
  }

  const ids = new Set<string>();
  for (const round of TEA_ROUNDS) {
    const deck = decks[round];
    if (!Object.hasOwn(decks, round) || !Array.isArray(deck) || deck.length !== TEA_DECK_SIZE) {
      throw new TypeError(`Le paquet Thé du round ${round} doit contenir exactement 30 cartes`);
    }
    for (const card of deck) {
      if (!card || typeof card !== 'object' || Array.isArray(card)
        || !Object.hasOwn(card, 'id') || typeof card.id !== 'string' || card.id.trim() === '') {
        throw new TypeError('Chaque instance de Thé doit avoir un ID non blanc');
      }
      if (!Object.hasOwn(card, 'round') || card.round !== round) {
        throw new TypeError(`Instance de Thé incompatible avec le round ${round} de son paquet`);
      }
      if (ids.has(card.id)) throw new TypeError('ID d’instance de Thé dupliqué');
      ids.add(card.id);
    }
  }

  const { openChairs, activeBlockers } = teaTableForPlayerCount(playerCount);
  const [teaI, teaII, teaIII] = TEA_ROUNDS.map(round => shuffle(decks[round], random));
  return {
    table: {
      openChairs, activeBlockers,
      placements: teaI.slice(0, openChairs).map((card, chairIndex) => ({ chairIndex, card })),
    },
    reserves: { 1: teaI.slice(openChairs), 2: teaII, 3: teaIII },
  };
}
