import { REGION_CATALOG, getActiveRegionCircuit, getActiveRegionNeighbors, initialRegionScores } from '@wonderland/shared';
import type { RegionId } from '@wonderland/shared';
import type { RegionScoreMarkerSetup } from './region-score-markers.ts';

export type TwoPlayerSetupQuest = Readonly<{ id: string; exploitRegionId: RegionId }>;

type InitialRegionScores = Pick<RegionScoreMarkerSetup, 'placements' | 'storedMarkerId'>;

export type TwoPlayerRegionSetupInput = Readonly<{
  shuffledQuestDeck: readonly TwoPlayerSetupQuest[];
  initialRegionScores: InitialRegionScores;
}>;

/** Internal domain data, not a public view. The remaining deck is face down. */
export type TwoPlayerRegionSetupResult = Readonly<{
  revealedQuest: TwoPlayerSetupQuest;
  excludedRegionId: RegionId;
  excludedQuests: readonly TwoPlayerSetupQuest[];
  remainingQuestDeck: readonly TwoPlayerSetupQuest[];
  regionScores: Required<RegionScoreMarkerSetup>;
  activeRegionCircuit: readonly RegionId[];
  activeRegionNeighbors: Readonly<Record<RegionId, readonly RegionId[]>>;
}>;

/**
 * WW-SETUP-004 / WW-COUNT-001 / WW-MAP-004 — FR p. 4 steps 10–11 and p. 21 steps 1–3.
 * The caller owns phase and player count, supplies all 30 base Quests already shuffled
 * (top at index 0), and provides the complete initial Score marker inventory.
 * Throws TypeError for an invalid deck or inventory. No random draw or reshuffle here.
 */
export function resolveTwoPlayerRegionSetup(input: TwoPlayerRegionSetupInput): TwoPlayerRegionSetupResult {
  const { shuffledQuestDeck, initialRegionScores: scores } = input;
  if (!Array.isArray(shuffledQuestDeck) || shuffledQuestDeck.length !== 30) {
    throw new TypeError('La pioche initiale doit contenir exactement 30 Quêtes');
  }
  const questIds = new Set<string>();
  for (const quest of shuffledQuestDeck) {
    if (!quest || typeof quest !== 'object' || Array.isArray(quest)
      || !Object.hasOwn(quest, 'id') || typeof quest.id !== 'string' || quest.id.trim() === '') {
      throw new TypeError('Chaque Quête doit avoir un ID non vide');
    }
    if (questIds.has(quest.id)) throw new TypeError('ID de Quête dupliqué');
    questIds.add(quest.id);
    if (!Object.hasOwn(quest, 'exploitRegionId') || typeof quest.exploitRegionId !== 'string'
      || !Object.hasOwn(REGION_CATALOG.names, quest.exploitRegionId)) {
      throw new TypeError('Région d’Exploit inconnue');
    }
  }
  // Validate with the #59 schema but keep the original placement objects, not parsed copies.
  if (!initialRegionScores.safeParse(scores).success) {
    throw new TypeError('Inventaire initial des marqueurs Score de Région incohérent');
  }

  const revealedQuest = shuffledQuestDeck[0];
  const excludedRegionId = revealedQuest.exploitRegionId;
  const excludedQuests: TwoPlayerSetupQuest[] = [];
  const remainingQuestDeck: TwoPlayerSetupQuest[] = [];
  for (const quest of shuffledQuestDeck) {
    (quest.exploitRegionId === excludedRegionId ? excludedQuests : remainingQuestDeck).push(quest);
  }
  // The entire catalogue supplies the keys; the excluded region maps to no neighbors.
  const activeRegionNeighbors = Object.fromEntries(REGION_CATALOG.clockwise.map(regionId => (
    [regionId, getActiveRegionNeighbors(regionId, excludedRegionId)] as const
  ))) as Record<RegionId, readonly RegionId[]>;

  return {
    revealedQuest,
    excludedRegionId,
    excludedQuests,
    remainingQuestDeck,
    regionScores: {
      placements: scores.placements.filter(({ regionId }) => regionId !== excludedRegionId),
      storedMarkerId: scores.storedMarkerId,
      // The validated inventory has exactly one placement per region.
      excludedPlacement: scores.placements.find(({ regionId }) => regionId === excludedRegionId)!,
    },
    activeRegionCircuit: getActiveRegionCircuit(excludedRegionId),
    activeRegionNeighbors,
  };
}
