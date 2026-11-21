import { expect, it, vi } from 'vitest';
import { prepareInitialTea } from '@wonderland/game-engine';
import type { InitialTeaSetupInput, TeaCardInstance } from '@wonderland/game-engine';

const deckFor = (round: TeaCardInstance['round']): readonly TeaCardInstance[] => Object.freeze(
  Array.from({ length: 30 }, (_, i) => Object.freeze({ id: `fixture-${3 * i + round}`, round })),
);
const decks = Object.freeze({ 1: deckFor(1), 2: deckFor(2), 3: deckFor(3) });

// Independent oracles for Fisher–Yates: always swap with index 0, always with self,
// or always with index 1, respectively. Each segment has exactly 29 values.
const swapFirst = Array<number>(29).fill(0);
const swapSelf = Array<number>(29).fill(0.999);
const swapSecond = Array.from({ length: 29 }, (_, i) => 1.5 / (30 - i));
const rotateFromFirst = ([first, ...rest]: readonly TeaCardInstance[]) => [...rest, first];
const rotateFromSecond = ([first, second, ...rest]: readonly TeaCardInstance[]) => [first, ...rest, second];

function scriptedRandom(...segments: readonly number[][]) {
  const script = segments.flat();
  let i = 0;
  return vi.fn(() => {
    if (i === script.length) throw new Error('Unexpected RNG call');
    return script[i++];
  });
}

it.each([
  { playerCount: 2, blockers: ['4J', '5J'], open: 11, kept: 19 },
  { playerCount: 3, blockers: ['4J', '5J'], open: 11, kept: 19 },
  { playerCount: 4, blockers: ['5J'], open: 12, kept: 18 },
  { playerCount: 5, blockers: [], open: 13, kept: 17 },
])('places only the Thé I prefix at $playerCount seats and conserves all 90 instances', ({ playerCount, blockers, open, kept }) => {
  const input = Object.freeze({ playerCount, decks });
  const random = scriptedRandom(swapFirst, swapSelf, swapSecond);
  const result = prepareInitialTea(input, random);
  const shuffledI = rotateFromFirst(decks[1]);

  expect(result.table).toEqual({
    openChairs: open,
    activeBlockers: blockers,
    placements: shuffledI.slice(0, open).map((card, chairIndex) => ({ chairIndex, card })),
  });
  expect(result.reserves).toEqual({ 1: shuffledI.slice(open), 2: decks[2], 3: rotateFromSecond(decks[3]) });
  expect(([1, 2, 3] as const).map(round => result.reserves[round].length)).toEqual([kept, 30, 30]);
  expect(random).toHaveBeenCalledTimes(87);

  const dealt = [
    result.table.placements.map(({ card }) => card), result.reserves[1], result.reserves[2], result.reserves[3],
  ] as const;
  const allCards = dealt.flat();
  const originals = new Map(Object.values(decks).flat().map(card => [card.id, card]));
  expect(allCards).toHaveLength(90);
  expect(new Set(allCards.map(card => card.id))).toEqual(new Set(originals.keys()));
  expect(dealt.map(cards => [...new Set(cards.map(card => card.round))])).toEqual([[1], [1], [2], [3]]);
  for (const card of allCards) expect(card).toBe(originals.get(card.id));
  expect(decks).toStrictEqual({ 1: deckFor(1), 2: deckFor(2), 3: deckFor(3) });
});

it('consumes 29 values in each round in order, then replays exactly or changes the placement with a rotated script', () => {
  const input = { playerCount: 2, decks };
  const first = prepareInitialTea(input, scriptedRandom(swapFirst, swapSelf, swapSecond));
  const replay = scriptedRandom(swapFirst, swapSelf, swapSecond);
  expect(prepareInitialTea(input, replay)).toStrictEqual(first);
  expect(replay).toHaveBeenCalledTimes(87);

  const rotated = scriptedRandom(swapSecond, swapFirst, swapSelf);
  const changed = prepareInitialTea(input, rotated);
  const shuffledI = rotateFromSecond(decks[1]);
  expect(changed.table.placements.map(({ card }) => card)).toEqual(shuffledI.slice(0, 11));
  expect(changed.table.placements[0].card.id).not.toBe(first.table.placements[0].card.id);
  expect(changed.reserves).toEqual({ 1: shuffledI.slice(11), 2: rotateFromFirst(decks[2]), 3: decks[3] });
  expect(rotated).toHaveBeenCalledTimes(87);
});

it('keeps distinct instances with the same motif and does not read their effects or interpret IDs', () => {
  const sameMotif = (id: string) => Object.freeze({
    id, round: 1 as const, motif: 'same',
    get effect(): never { throw new Error('The setup must not read effects'); },
  });
  const first = sameMotif('odd');
  const second = sameMotif(' odd ');
  const result = prepareInitialTea({ playerCount: 2, decks: { ...decks, 1: [first, second, ...decks[1].slice(2)] } }, () => 0.999);
  expect(result.table.placements[0].card).toBe(first);
  expect(result.table.placements[1].card).toBe(second);
});

it.each([1, 6, 2.5, NaN])('rejects seat count %s without any RNG', playerCount => {
  const random = vi.fn(() => 0);
  expect(() => prepareInitialTea({ playerCount, decks }, random)).toThrow(TypeError);
  expect(random).not.toHaveBeenCalled();
});

it.each([
  ['missing decks', undefined],
  ['missing III', { 1: decks[1], 2: decks[2] }],
  ['unknown deck round replacing III', { 1: decks[1], 2: decks[2], 4: decks[3] }],
  ['extra deck', { ...decks, 4: decks[3] }],
  ['short deck III', { ...decks, 3: decks[3].slice(0, -1) }],
  ['long deck III', { ...decks, 3: [...decks[3], decks[3][0]] }],
  ['unknown instance round', { ...decks, 3: [...decks[3].slice(0, -1), { id: 'new', round: 4 }] }],
  ['wrong instance round', { ...decks, 3: [...decks[3].slice(0, -1), { id: 'new', round: 2 }] }],
  ['empty ID', { ...decks, 3: [...decks[3].slice(0, -1), { id: '', round: 3 }] }],
  ['blank ID', { ...decks, 3: [...decks[3].slice(0, -1), { id: ' \t', round: 3 }] }],
  ['duplicate within III', { ...decks, 3: [...decks[3].slice(0, -1), decks[3][0]] }],
  ['duplicate across I and III', { ...decks, 3: [...decks[3].slice(0, -1), { id: decks[1][0].id, round: 3 }] }],
])('rejects %s before even shuffling round I', (_, invalidDecks) => {
  const random = vi.fn(() => 0);
  expect(() => prepareInitialTea({ playerCount: 2, decks: invalidDecks } as InitialTeaSetupInput, random)).toThrow(TypeError);
  expect(random).not.toHaveBeenCalled();
});

it('propagates an out-of-range RNG value in round III without returning partial setup', () => {
  const random = scriptedRandom(swapFirst, swapSelf, [1]);
  const input = Object.freeze({ playerCount: 5, decks });
  expect(() => prepareInitialTea(input, random)).toThrow(RangeError);
  expect(random).toHaveBeenCalledTimes(59);
  expect(decks).toStrictEqual({ 1: deckFor(1), 2: deckFor(2), 3: deckFor(3) });
});
