import { MAX_PLAYERS, MIN_PLAYERS } from '@wonderland/shared';

const VISIBLE_SLOTS = 3;

export type WonderlandCardInstance = Readonly<{ id: string; category: 'inhabitant' | 'object' }>;
export type MarketPieceInstance = Readonly<{ id: string; kind: 'silhouette' | 'object-token'; cardId: string }>;
type MarketCardWithPieces = Readonly<{ card: WonderlandCardInstance; pieces: readonly MarketPieceInstance[] }>;
type MarketPlacement = MarketCardWithPieces & Readonly<{ slotIndex: number }>;

export type InitialMarketSetupInput = Readonly<{
  playerCount: number;
  shuffledDeck: readonly MarketCardWithPieces[];
}>;

/** Internal domain data, not a public/network view. Only market placements are face up. */
export type InitialMarketSetup = Readonly<{
  market: Readonly<{ placements: readonly MarketPlacement[] }>;
  reserves: Readonly<{ deck: readonly WonderlandCardInstance[]; pieces: readonly MarketPieceInstance[] }>;
}>;

function hasOwnData(value: object, key: string | number): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
}

function hasOwnFields(value: unknown, ...keys: string[]): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && keys.every(key => hasOwnData(value, key));
}

function isNonBlankId(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== '';
}

/**
 * WW-SETUP-004 (steps 4–5), WW-COUNT-001/002. The caller supplies the frozen seat count
 * and the already shuffled lot, top first. At 2J the exclusions and their pieces are
 * already absent. Validate the whole lot before placing anything; no RNG or catalogue lookup.
 */
export function prepareInitialMarket(input: InitialMarketSetupInput): InitialMarketSetup {
  if (!hasOwnFields(input, 'playerCount', 'shuffledDeck')) {
    throw new TypeError('Lot de préparation du marché invalide');
  }
  const { playerCount, shuffledDeck } = input;
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new TypeError('Effectif incohérent pour la préparation du marché');
  }
  const deckSize = playerCount === 2 ? 22 : 24;
  if (!Array.isArray(shuffledDeck) || shuffledDeck.length !== deckSize) {
    throw new TypeError(`Le marché exige un lot de ${deckSize} cartes`);
  }

  const cardIds = new Set<string>();
  const pieceIds = new Set<string>();
  for (let i = 0; i < deckSize; i++) {
    if (!hasOwnData(shuffledDeck, i) || !hasOwnFields(shuffledDeck[i], 'card', 'pieces')) {
      throw new TypeError('Chaque entrée du marché doit fournir sa carte et son matériel');
    }
    const { card, pieces } = shuffledDeck[i];
    if (!hasOwnFields(card, 'id', 'category') || !isNonBlankId(card.id)) {
      throw new TypeError('Chaque carte du marché doit avoir un ID non blanc et une catégorie explicite');
    }
    if (cardIds.has(card.id)) throw new TypeError('ID de carte du marché dupliqué');
    cardIds.add(card.id);

    const { category } = card;
    if (category !== 'inhabitant' && category !== 'object') {
      throw new TypeError('Catégorie de carte du marché inconnue');
    }
    const expectedKind = category === 'inhabitant' ? 'silhouette' : 'object-token';
    const expectedCount = category === 'inhabitant' ? 1 : 2;
    if (!Array.isArray(pieces) || pieces.length !== expectedCount) {
      throw new TypeError('Nombre de pièces incompatible avec la carte du marché');
    }
    for (let j = 0; j < expectedCount; j++) {
      if (!hasOwnData(pieces, j)) throw new TypeError('Pièce du marché manquante');
      const piece = pieces[j];
      if (!hasOwnFields(piece, 'id', 'kind', 'cardId') || !isNonBlankId(piece.id)) {
        throw new TypeError('Chaque pièce du marché doit avoir un ID, un type et un rattachement explicites');
      }
      if (piece.kind !== expectedKind || piece.cardId !== card.id) {
        throw new TypeError('Type ou rattachement de pièce incompatible avec la carte du marché');
      }
      if (pieceIds.has(piece.id)) throw new TypeError('ID de pièce du marché dupliqué');
      pieceIds.add(piece.id);
    }
  }

  const placements: MarketPlacement[] = [];
  const deck: WonderlandCardInstance[] = [];
  const hiddenPieces: MarketPieceInstance[] = [];
  for (let i = 0; i < deckSize; i++) {
    const { card, pieces } = shuffledDeck[i];
    let destination = hiddenPieces;
    if (i < VISIBLE_SLOTS) {
      destination = [];
      placements.push({ slotIndex: i, card, pieces: destination });
    } else {
      deck.push(card);
    }
    for (let j = 0; j < pieces.length; j++) destination.push(pieces[j]);
  }
  return { market: { placements }, reserves: { deck, pieces: hiddenPieces } };
}
