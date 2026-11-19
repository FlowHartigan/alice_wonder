import { expect, expectTypeOf, it } from 'vitest';
import { triggersTwoPlayerDrawStop } from '@wonderland/game-engine';
import type { TwoPlayerDrawStopSnapshot } from '@wonderland/game-engine';

function roundTwo(humanCombatants: TwoPlayerDrawStopSnapshot['humanCombatants']): TwoPlayerDrawStopSnapshot {
  return { gamePlayerCount: 2, round: 2, firstDrawFullyResolved: true, humanCombatants };
}

it.each([
  ['au départ', 5],
  ['au départ', 6],
  ['en cours de résolution', 5],
  ['en cours de résolution', 6],
] as const)('ne déclenche pas le motif spécial %s à Force %i (round II)', (_stage, strength) => {
  const snapshot = roundTwo([{ status: 'in-contention', strength }]);
  expect(triggersTwoPlayerDrawStop({ ...snapshot, firstDrawFullyResolved: false })).toBe(false);
});

it.each([
  [1, 2, false], [1, 3, true], [1, 4, true],
  [2, 4, false], [2, 5, true], [2, 6, true],
  [3, 6, false], [3, 7, true], [3, 8, true],
] as const)('round %i, seul combattant à Force %i après résolution : motif spécial = %s', (round, strength, stops) => {
  const snapshot = roundTwo([{ status: 'in-contention', strength }]);
  expect(triggersTwoPlayerDrawStop({ ...snapshot, round })).toBe(stops);
});

it('limite le contrat aux rounds I, II et III', () => {
  expectTypeOf<Parameters<typeof triggersTwoPlayerDrawStop>[0]['round']>().toEqualTypeOf<1 | 2 | 3>();
});

it('déclenche le motif spécial pour A à 6 derrière B ayant abandonné à 8, sans mutation', () => {
  const a = Object.freeze({ status: 'in-contention', strength: 6 } as const);
  const b = Object.freeze({ status: 'withdrawn', strength: 8 } as const);
  const snapshot = Object.freeze(roundTwo(Object.freeze([a, b])));

  expect(triggersTwoPlayerDrawStop(snapshot)).toBe(true);
  expect(snapshot.humanCombatants).toEqual([
    { status: 'in-contention', strength: 6 },
    { status: 'withdrawn', strength: 8 },
  ]);
});

it('ne compte pas un combattant ayant échoué parmi ceux encore en lice', () => {
  expect(triggersTwoPlayerDrawStop(roundTwo([
    { status: 'failed', strength: 0 }, { status: 'in-contention', strength: 5 },
  ]))).toBe(true);
});

it('ne déclenche pas le motif spécial sans combattant en lice, même après un abandon à Force 8', () => {
  expect(triggersTwoPlayerDrawStop(roundTwo([]))).toBe(false);
  expect(triggersTwoPlayerDrawStop(roundTwo([
    { status: 'withdrawn', strength: 8 }, { status: 'failed', strength: 0 },
  ]))).toBe(false);
});

it('ne déclenche pas le motif spécial avec deux combattants en lice, même si un seul dépasse le seuil', () => {
  expect(triggersTwoPlayerDrawStop(roundTwo([
    { status: 'in-contention', strength: 25 }, { status: 'in-contention', strength: 4 },
  ]))).toBe(false);
});

it.each([3, 4, 5])('ne déclenche pas le motif spécial dans une partie à %i joueurs', (gamePlayerCount) => {
  const snapshot = roundTwo([{ status: 'in-contention', strength: 6 }]);
  expect(triggersTwoPlayerDrawStop({ ...snapshot, gamePlayerCount })).toBe(false);
});
