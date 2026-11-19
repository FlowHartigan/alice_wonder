import { describe, expect, it, vi } from 'vitest';
import { assignRegionScoreMarkers } from '@wonderland/game-engine';
import { REGION_CATALOG, REGION_SCORE_MARKER_CATALOG } from '@wonderland/shared';
import type { RegionScoreMarkerId } from '@wonderland/shared';

const { markers } = REGION_SCORE_MARKER_CATALOG;
const { clockwise } = REGION_CATALOG;
const markerIds = markers.map(({ id }) => id);

function expectConservation(ids: readonly RegionScoreMarkerId[]) {
  expect([...ids].sort()).toEqual([...markerIds].sort());
}

describe('Marqueurs Score de Région (WW-MAP-004 / WW-SETUP-004)', () => {
  it('versionne les six barèmes validés pour le projet, sans 4/4/12 ni ID de Région', () => {
    expect(REGION_SCORE_MARKER_CATALOG.version).toBe(1);
    expect(markers.map(({ id, pointsByRound }) => [id, pointsByRound[1], pointsByRound[2], pointsByRound[3]])).toEqual([
      ['marqueur-score-01', 2, 6, 10],
      ['marqueur-score-02', 2, 6, 12],
      ['marqueur-score-03', 2, 8, 10],
      ['marqueur-score-04', 4, 6, 10],
      ['marqueur-score-05', 4, 8, 8],
      ['marqueur-score-06', 6, 6, 8],
    ]);
    expect(markers.map(({ pointsByRound }) => pointsByRound)).not.toContainEqual({ 1: 4, 2: 4, 3: 12 });
    for (const { id } of markers) expect(clockwise).not.toContain(id);
    for (const value of [REGION_SCORE_MARKER_CATALOG, markers, ...markers, ...markers.map(m => m.pointsByRound)]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it.each([2, 3, 4, 5] as const)('à %iJ sans exclusion désignée, affecte cinq marqueurs et range le sixième', playerCount => {
    const setup = assignRegionScoreMarkers({ playerCount }, () => 0);
    expect(setup.placements.map(({ regionId }) => regionId)).toEqual(clockwise);
    expect(setup).not.toHaveProperty('excludedPlacement');
    expectConservation([...setup.placements.map(({ markerId }) => markerId), setup.storedMarkerId]);
    expect(setup).toEqual(assignRegionScoreMarkers({ playerCount: 2 }, () => 0));
  });

  it('reproduit la même affectation avec les mêmes tirages et varie avec une autre source', () => {
    const setup = assignRegionScoreMarkers({ playerCount: 5 }, () => 0);
    const different = assignRegionScoreMarkers({ playerCount: 5 }, () => 0.99);
    expect(assignRegionScoreMarkers({ playerCount: 5 }, () => 0)).toEqual(setup);
    expect(different.placements).not.toEqual(setup.placements);
    expect(different.storedMarkerId).not.toBe(setup.storedMarkerId);
    expectConservation([...different.placements.map(({ markerId }) => markerId), different.storedMarkerId]);
  });

  it.each(clockwise)('à 2J, retire le marqueur de %s sans déplacer les autres ni changer le sixième', excludedRegionId => {
    const fullRandom = vi.fn(() => 0);
    const twoPlayerRandom = vi.fn(() => 0);
    const full = assignRegionScoreMarkers({ playerCount: 3 }, fullRandom);
    const setup = assignRegionScoreMarkers({ playerCount: 2, excludedRegionId }, twoPlayerRandom);
    expect(fullRandom).toHaveBeenCalledTimes(5);
    expect(twoPlayerRandom).toHaveBeenCalledTimes(5);
    expect(setup.placements.map(({ regionId }) => regionId)).not.toContain(excludedRegionId);
    expect(setup.placements).toEqual(full.placements.filter(({ regionId }) => regionId !== excludedRegionId));
    expect(setup.storedMarkerId).toBe(full.storedMarkerId);
    const excluded = full.placements.find(({ regionId }) => regionId === excludedRegionId)!;
    expect(setup.excludedPlacement).toEqual(excluded);
    expect(excluded.markerId).not.toBe(setup.storedMarkerId);
    expectConservation([...setup.placements.map(({ markerId }) => markerId), setup.storedMarkerId, excluded.markerId]);
  });

  it('propage le refus de shuffle si la source ne renvoie pas une valeur de [0, 1)', () => {
    expect(() => assignRegionScoreMarkers({ playerCount: 3 }, () => 1)).toThrow(RangeError);
  });
});
