import { REGION_CATALOG, getActiveRegionCircuit } from '@wonderland/shared';
import type { RegionId } from '@wonderland/shared';

export type FirstBattleRegionInput = Readonly<
  | { playerCount: 2; dieResult: number; excludedRegionId: RegionId }
  | { playerCount: 3 | 4 | 5; dieResult: number; excludedRegionId?: never }
>;

/**
 * WW-SETUP-004 / WW-COUNT-001 / WW-MAP-001 — FR p. 4 step 11 and p. 21 step 4.
 * Internal calculation only: the caller supplies the result and the completed exclusion at 2J.
 * Throws TypeError for inconsistent inputs; does not roll a die or change game state.
 */
export function resolveFirstBattleRegion({ playerCount, dieResult, excludedRegionId }: FirstBattleRegionInput): RegionId {
  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4 && playerCount !== 5) {
    throw new TypeError('Premier combat : effectif attendu de 2 à 5 joueurs');
  }
  if (!Number.isInteger(dieResult) || dieResult < 0) {
    throw new TypeError('Premier combat : nombre de pas entier fini et non négatif attendu');
  }
  if (playerCount === 2) {
    if (!REGION_CATALOG.clockwise.includes(excludedRegionId)) {
      throw new TypeError('Premier combat : ID de Région écartée valide requis à 2 joueurs');
    }
  } else if (excludedRegionId !== undefined) {
    throw new TypeError('Premier combat : aucune Région écartée à 3–5 joueurs');
  }

  // Index 0 is the starting region, not a step. Count transitions on the active circuit only.
  const circuit = getActiveRegionCircuit(excludedRegionId);
  return circuit[dieResult % circuit.length];
}
