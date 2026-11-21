import { expect, it } from 'vitest';
import { prepareInitialMarket } from '@wonderland/game-engine';
import type { InitialMarketSetupInput, MarketPieceInstance, WonderlandCardInstance } from '@wonderland/game-engine';

function entryFor(id: string, category: WonderlandCardInstance['category'], ...pieceIds: string[]) {
  const kind = category === 'object' ? 'object-token' : 'silhouette';
  return Object.freeze({
    card: Object.freeze({ id, category }),
    pieces: Object.freeze(pieceIds.map(pieceId => Object.freeze({ id: pieceId, kind, cardId: id }))),
  });
}

function deckOf(size: number, objectIndices: readonly number[]) {
  return Array.from({ length: size }, (_, i) => objectIndices.includes(i)
    ? entryFor(`fixture-${i}`, 'object', `sample ${2 * i + 71}`, `sample ${2 * i + 70}`)
    : entryFor(`fixture-${i}`, 'inhabitant', `sample ${2 * i + 70}`));
}

it.each([
  { playerCount: 2, size: 22, kept: 19, start: 0, objectIndices: [0, 8] },
  { playerCount: 3, size: 24, kept: 21, start: 5, objectIndices: [0, 6, 20] },
  { playerCount: 4, size: 24, kept: 21, start: 22, objectIndices: [1, 4, 10, 23] },
  { playerCount: 5, size: 24, kept: 21, start: 13, objectIndices: [0, 3, 13, 15, 21] },
])('places the exact prefix with its pieces at $playerCount seats', ({ playerCount, size, kept, start, objectIndices }) => {
  const original = deckOf(size, objectIndices);
  const shuffledDeck = Object.freeze([...original.slice(start), ...original.slice(0, start)]);
  const input = Object.freeze({ playerCount, shuffledDeck });
  const result = prepareInitialMarket(input);
  const { placements } = result.market;

  expect(placements.map(({ slotIndex }) => slotIndex)).toEqual([0, 1, 2]);
  expect(new Set(placements.map(({ card }) => card.category))).toEqual(new Set(['inhabitant', 'object']));
  expect(result.reserves.deck).toHaveLength(kept);
  const cards = [...placements.map(({ card }) => card), ...result.reserves.deck];
  expect(cards).toHaveLength(size);
  for (const [i, { card, pieces }] of shuffledDeck.entries()) {
    expect(cards[i]).toBe(card);
    if (i < 3) {
      expect(placements[i].pieces).toHaveLength(pieces.length);
      pieces.forEach((piece, j) => expect(placements[i].pieces[j]).toBe(piece));
    } else {
      const reserved = result.reserves.pieces.filter(piece => piece.cardId === card.id);
      expect(reserved).toHaveLength(pieces.length);
      for (const piece of pieces) expect(reserved).toContain(piece);
      expect(placements.flatMap(p => p.pieces).some(piece => piece.cardId === card.id)).toBe(false);
    }
  }
  const allPieces = [...placements.flatMap(({ pieces }) => pieces), ...result.reserves.pieces];
  const supplied = shuffledDeck.flatMap(({ pieces }) => pieces);
  expect(allPieces).toHaveLength(supplied.length);
  expect(new Set(allPieces.map(({ id }) => id))).toEqual(new Set(supplied.map(({ id }) => id)));
  expect(prepareInitialMarket(input)).toStrictEqual(result);
});

it('takes category and ownership from explicit fields, not from names, IDs or effects', () => {
  const inhabitant = entryFor('odd', 'inhabitant', ' odd ');
  const object = entryFor(' odd ', 'object', 'odd', 'another piece');
  const shuffledDeck = [inhabitant, { ...object, card: Object.freeze({
    ...object.card, name: 'silhouette',
    get effect(): never { throw new Error('The setup must not read effects'); },
  }) }, ...deckOf(22, [])];
  const { market, reserves } = prepareInitialMarket({ playerCount: 3, shuffledDeck });
  expect(market.placements[0].pieces[0]).toBe(inhabitant.pieces[0]);
  expect(market.placements[1].card).toBe(shuffledDeck[1].card);
  expect(market.placements[1].pieces[0]).toBe(object.pieces[0]);
  expect(reserves.deck[0]).toBe(shuffledDeck[3].card);
});

const validDeck = Object.freeze(deckOf(24, [0, 4, 23]));
const visibleObject = validDeck[0];
const hiddenObject = validDeck[23];
const hiddenInhabitant = validDeck[22];
const token = hiddenObject.pieces[0];

it.each([1, 6, 2.5, NaN, Infinity, '3', null])('rejects invalid seat count %s', playerCount => {
  expect(() => prepareInitialMarket({ playerCount, shuffledDeck: validDeck } as InitialMarketSetupInput)).toThrow(TypeError);
});

it.each([[2, 24], [3, 22], [4, 22], [5, 22], [2, 21], [5, 25]])(
  'rejects %i seats with %i cards', (playerCount, size) => {
    expect(() => prepareInitialMarket({ playerCount, shuffledDeck: deckOf(size, [0, 4]) })).toThrow(TypeError);
  },
);

function expectInvalid(input: unknown) {
  expect(() => prepareInitialMarket(input as InitialMarketSetupInput)).toThrow(TypeError);
}

it('requires an actual lot and a dense array of card / pieces entries', () => {
  expectInvalid(null);
  expectInvalid({ playerCount: 3 });
  expectInvalid({ playerCount: 3, shuffledDeck: { ...validDeck, length: 24 } });
  const sparse = validDeck.slice();
  delete sparse[23];
  expectInvalid({ playerCount: 3, shuffledDeck: sparse });
});

it.each<[string, unknown]>([
  ['missing or null entry', null],
  ['missing card', { pieces: hiddenObject.pieces }],
  ['card not an object record', { ...hiddenObject, card: [] }],
  ['missing card ID', { ...hiddenObject, card: { category: 'object' } }],
  ['non-string card ID', { ...hiddenObject, card: { id: 23, category: 'object' } }],
  ['blank card ID', { ...hiddenObject, card: { id: ' \t', category: 'object' } }],
  ['inherited card ID', { ...hiddenObject, card: Object.assign(Object.create({ id: token.cardId }), { category: 'object' }) }],
  ['duplicate card ID across prefix and suffix', { card: visibleObject.card, pieces: hiddenObject.pieces.map(p => ({ ...p, cardId: visibleObject.card.id })) }],
  ['missing category', { ...hiddenObject, card: { id: token.cardId } }],
  ['unknown category', { ...hiddenObject, card: { ...hiddenObject.card, category: 'other' } }],
  ['missing material list', { card: hiddenObject.card }],
  ['array-like material', { ...hiddenObject, pieces: { ...hiddenObject.pieces, length: 2 } }],
  ['short pair', { ...hiddenObject, pieces: [token] }],
  ['surplus token', { ...hiddenObject, pieces: [...hiddenObject.pieces, { ...token, id: 'surplus' }] }],
  ['sparse pair', { ...hiddenObject, pieces: Array(2) }],
  ['null token', { ...hiddenObject, pieces: [token, null] }],
  ['missing piece ID', { ...hiddenObject, pieces: [token, { kind: token.kind, cardId: token.cardId }] }],
  ['non-string piece ID', { ...hiddenObject, pieces: [token, { ...token, id: 7 }] }],
  ['blank piece ID', { ...hiddenObject, pieces: [token, { ...token, id: '\n ' }] }],
  ['missing piece kind', { ...hiddenObject, pieces: [token, { id: 'extra', cardId: token.cardId }] }],
  ['unknown piece kind', { ...hiddenObject, pieces: [token, { ...token, id: 'extra', kind: 'other' }] }],
  ['silhouette for object', { ...hiddenObject, pieces: [token, { ...token, id: 'extra', kind: 'silhouette' }] }],
  ['missing card reference', { ...hiddenObject, pieces: [token, { id: 'extra', kind: token.kind }] }],
  ['reference to a different card in the lot', { ...hiddenObject, pieces: [token, { ...token, id: 'extra', cardId: visibleObject.card.id }] }],
  ['reference to an absent card differing only by whitespace', { ...hiddenObject, pieces: [token, { ...token, id: 'extra', cardId: ` ${token.cardId}` }] }],
  ['pair reusing a token', { ...hiddenObject, pieces: [token, token] }],
  ['same piece in visible and hidden entries', { ...hiddenObject, pieces: [token, visibleObject.pieces[0]] }],
  ['duplicate piece ID despite consistent card references', { ...hiddenObject, pieces: [token, { ...token, id: visibleObject.pieces[0].id }] }],
])('rejects %s even in the last entry', (_, invalidEntry) => {
  expectInvalid(Object.freeze({ playerCount: 3, shuffledDeck: Object.freeze([...validDeck.slice(0, -1), invalidEntry]) }));
});

it.each<[string, readonly MarketPieceInstance[]]>([
  ['no silhouette', []],
  ['extra silhouette', [...hiddenInhabitant.pieces, { ...hiddenInhabitant.pieces[0], id: 'extra' }]],
  ['object token instead of silhouette', [{ ...hiddenInhabitant.pieces[0], kind: 'object-token' }]],
])('rejects an inhabitant with %s', (_, pieces) => {
  expectInvalid({ playerCount: 4, shuffledDeck: [...validDeck.slice(0, 22), { ...hiddenInhabitant, pieces }, hiddenObject] });
});

it('does not execute accessors in place of required data fields', () => {
  const pieces = [token, token];
  Object.defineProperty(pieces, 1, { get() { throw new Error('Not a data slot'); } });
  expectInvalid({ playerCount: 3, shuffledDeck: [...validDeck.slice(0, -1), { ...hiddenObject, pieces }] });
});
