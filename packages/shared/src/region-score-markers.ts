import { z } from 'zod';
import { REGION_CATALOG } from './regions.ts';
import type { RegionId } from './regions.ts';

function marker<Id extends string>(id: Id, roundI: number, roundII: number, roundIII: number) {
  return Object.freeze({ id, pointsByRound: Object.freeze({ 1: roundI, 2: roundII, 3: roundIII }) });
}

// WW-MAP-004 — livret FR p. 2 et 4, barèmes retenus par le propriétaire en #8.
// Ces identifiants désignent les pièces, indépendamment des Régions illustrées.
export const REGION_SCORE_MARKER_CATALOG = Object.freeze({
  version: 1,
  markers: Object.freeze([
    marker('marqueur-score-01', 2, 6, 10),
    marker('marqueur-score-02', 2, 6, 12),
    marker('marqueur-score-03', 2, 8, 10),
    marker('marqueur-score-04', 4, 6, 10),
    marker('marqueur-score-05', 4, 8, 8),
    marker('marqueur-score-06', 6, 6, 8),
  ]),
});

export type RegionScoreMarkerId = (typeof REGION_SCORE_MARKER_CATALOG.markers)[number]['id'];

const markerId = z.enum(REGION_SCORE_MARKER_CATALOG.markers.map(({ id }) => id));
export const initialRegionScores = z.strictObject({
  placements: z.array(z.strictObject({ regionId: z.enum(REGION_CATALOG.clockwise), markerId }))
    .length(REGION_CATALOG.clockwise.length),
  storedMarkerId: markerId,
}).refine(({ placements, storedMarkerId }) => (
  new Set(placements.map(({ regionId }) => regionId)).size === REGION_CATALOG.clockwise.length
  && new Set([storedMarkerId, ...placements.map(({ markerId }) => markerId)]).size === REGION_SCORE_MARKER_CATALOG.markers.length
), 'Inventaire initial des marqueurs Score de Région incohérent');

export type RegionScoresSetupView = {
  placements: { regionId: RegionId; regionName: string; pointsByRound: { 1: number; 2: number; 3: number } }[];
};
