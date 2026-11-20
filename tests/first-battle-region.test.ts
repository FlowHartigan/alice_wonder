import { describe, expect, it } from 'vitest';
import { resolveFirstBattleRegion } from '@wonderland/game-engine';
import type { FirstBattleRegionInput } from '@wonderland/game-engine';
import { REGION_CATALOG } from '@wonderland/shared';

const donjon = 'donjon-rouge';
const foret = 'foret-de-tulgey';
const jardin = 'jardin-des-fleurs-vivantes';
const mare = 'mare-de-larmes';
const comte = 'comte-de-la-deraison';

describe('Premier combat (WW-SETUP-004 / WW-COUNT-001 / WW-MAP-001)', () => {
  // Step counts exercise the calculation, not the faces of the die.
  it.each([3, 4, 5] as const)('à %iJ, compte les transitions depuis le Donjon et reboucle', (playerCount) => {
    const route = [donjon, foret, jardin, mare, comte, donjon, foret];
    expect(route.map((_, dieResult) => resolveFirstBattleRegion({ playerCount, dieResult }))).toEqual(route);
  });

  it.each([
    { excludedRegionId: donjon, route: [foret, jardin, mare, comte, foret, jardin] },
    { excludedRegionId: foret, route: [jardin, mare, comte, donjon, jardin, mare] },
    { excludedRegionId: jardin, route: [mare, comte, donjon, foret, mare, comte] },
    { excludedRegionId: mare, route: [comte, donjon, foret, jardin, comte, donjon] },
    { excludedRegionId: comte, route: [donjon, foret, jardin, mare, donjon, foret] },
  ] as const)('à 2J, part après $excludedRegionId et ne compte jamais cette Région', ({ excludedRegionId, route }) => {
    expect(route.map((_, dieResult) => resolveFirstBattleRegion({ playerCount: 2, dieResult, excludedRegionId })))
      .toEqual(route);
  });

  it('renvoie seulement un ID, de façon répétable, sans modifier les entrées ni le catalogue', () => {
    const input = Object.freeze({ playerCount: 2, dieResult: 2, excludedRegionId: donjon } as const);
    const catalogBefore = structuredClone(REGION_CATALOG);

    expect(resolveFirstBattleRegion(input)).toBe(mare);
    expect(resolveFirstBattleRegion({ playerCount: 4, dieResult: 12 })).toBe(jardin);
    expect(resolveFirstBattleRegion(input)).toBe(mare);
    expect(REGION_CATALOG).toEqual(catalogBefore);
  });

  it.each([1, 6, 2.5, NaN, '2'])('refuse un effectif invalide : %s', (playerCount) => {
    const input = { playerCount, dieResult: 2, excludedRegionId: donjon } as FirstBattleRegionInput;
    expect(() => resolveFirstBattleRegion(input)).toThrow(/effectif/);
  });

  it.each([-1, 1.5, NaN, Infinity, -Infinity, '2', undefined])('refuse un nombre de pas invalide : %s', (dieResult) => {
    const input = { playerCount: 3, dieResult } as FirstBattleRegionInput;
    expect(() => resolveFirstBattleRegion(input)).toThrow(/nombre de pas/);
  });

  it.each([undefined, 'region-inconnue', null])('refuse une exclusion manquante ou inconnue à 2J : %s', (excludedRegionId) => {
    const input = { playerCount: 2, dieResult: 2, excludedRegionId } as FirstBattleRegionInput;
    expect(() => resolveFirstBattleRegion(input)).toThrow(/ID de Région écartée/);
  });

  it.each([3, 4, 5] as const)('refuse une exclusion à %iJ', (playerCount) => {
    const input = { playerCount, dieResult: 2, excludedRegionId: donjon } as unknown as FirstBattleRegionInput;
    expect(() => resolveFirstBattleRegion(input)).toThrow(/aucune Région écartée/);
  });
});
