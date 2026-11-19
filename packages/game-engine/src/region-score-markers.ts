import { REGION_CATALOG, REGION_SCORE_MARKER_CATALOG } from '@wonderland/shared';
import type { RegionId, RegionScoreMarkerId } from '@wonderland/shared';
import { shuffle } from './game.ts';
import type { RandomSource } from './game.ts';

export type RegionScoreMarkerSetupOptions = Readonly<
  | { playerCount: 2; excludedRegionId?: RegionId }
  | { playerCount: 3 | 4 | 5; excludedRegionId?: never }
>;

type Placement = Readonly<{ regionId: RegionId; markerId: RegionScoreMarkerId }>;

export type RegionScoreMarkerSetup = Readonly<{
  placements: readonly Placement[];
  storedMarkerId: RegionScoreMarkerId;
  excludedPlacement?: Placement;
}>;

/** WW-MAP-004 / WW-SETUP-004 — affecte sur le plateau complet, puis retire à 2J si la Région est déjà désignée. */
export function assignRegionScoreMarkers(
  options: RegionScoreMarkerSetupOptions, random: RandomSource,
): RegionScoreMarkerSetup {
  const shuffled = shuffle(REGION_SCORE_MARKER_CATALOG.markers, random);
  const placements = REGION_CATALOG.clockwise.map((regionId, index) => ({ regionId, markerId: shuffled[index].id }));
  const storedMarkerId = shuffled[placements.length].id;

  const excludedPlacement = options.playerCount === 2
    ? placements.find(({ regionId }) => regionId === options.excludedRegionId)
    : undefined;
  if (excludedPlacement === undefined) return { placements, storedMarkerId };

  return {
    placements: placements.filter(placement => placement !== excludedPlacement),
    storedMarkerId,
    excludedPlacement,
  };
}
