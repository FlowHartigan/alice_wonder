import { z } from 'zod';
import { FACTION_IDS } from './index.ts';
import type { FactionId } from './index.ts';

// Private starting subset only (WW-SETUP-001/002/003). Forge is the only Ally here;
// this is not the catalogue of physical tokens or Ally sets/effects (#11).
export const STARTING_TOKEN_TYPES = {
  'leader-1': { kind: 'leader', strength: 1 },
  'leader-2': { kind: 'leader', strength: 2 },
  'artifact-3': { kind: 'artifact', strength: 3 },
  'forge-1': { kind: 'forge', strength: 1 },
  'madness-single': { kind: 'madness', level: 'single' },
  'madness-double': { kind: 'madness', level: 'double' },
  poison: { kind: 'poison' },
} as const;

type TokenType = keyof typeof STARTING_TOKEN_TYPES;
const token = z.strictObject({ id: z.string().min(1), type: z.enum(Object.keys(STARTING_TOKEN_TYPES) as TokenType[]) });
const zone = z.array(token);
const count = z.int().nonnegative();
const seatResources = z.strictObject({
  playerId: z.uuid(), faction: z.enum(FACTION_IDS), boardFace: z.enum(['ordinary', 'golden-two-player']),
  supportersInReserve: count, supportersOnThirdForgeTrack: count, castlesInReserve: count,
  coveredAbilities: count, leaderStrength: count, shield: z.literal('intact'), victoryPoints: count, combat: count,
  tokenZones: z.strictObject({
    bag: zone, forgeRewards: zone, poisonReserve: zone, active: zone, exhausted: zone, madnessTrack: zone,
  }),
});
export const initialResourcesSnapshot = z.array(seatResources);
type SeatResources = z.infer<typeof seatResources>;
export type InitialResourcesSnapshot = z.infer<typeof initialResourcesSnapshot>;

/** One recipe for constructing and validating the initial holdings (FR p. 5 A–I, p. 21). No RNG here. */
export function startingSeatResources(playerId: string, faction: FactionId, playerCount: number): SeatResources {
  const twoPlayers = playerCount === 2;
  const instances = (type: TokenType, length: number) =>
    Array.from({ length }, (_, i) => ({ id: `${playerId}:${type}:${i + 1}`, type }));
  const artifacts = instances('artifact-3', 6);
  const artifactsInBag = 2;
  return {
    playerId, faction, boardFace: twoPlayers ? 'golden-two-player' : 'ordinary',
    supportersInReserve: 10, supportersOnThirdForgeTrack: 4, castlesInReserve: 5,
    coveredAbilities: 4, leaderStrength: 1, shield: 'intact', victoryPoints: 0, combat: 0,
    tokenZones: {
      bag: [
        ...instances('leader-1', 3), ...instances('leader-2', 1), ...artifacts.slice(0, artifactsInBag),
        ...instances('forge-1', twoPlayers ? 2 : 1), ...instances('madness-single', 2), ...instances('madness-double', 1),
      ],
      forgeRewards: artifacts.slice(artifactsInBag),
      poisonReserve: faction === 'jabberwocky' ? instances('poison', playerCount + 2) : [],
      active: [], exhausted: [], madnessTrack: [],
    },
  };
}

export function matchesStartingSeat(actual: SeatResources, expected: SeatResources): boolean {
  const { tokenZones, ...holdings } = expected;
  if (!Object.entries(holdings).every(([key, value]) => actual[key as keyof typeof holdings] === value)) return false;
  return (Object.keys(tokenZones) as (keyof typeof tokenZones)[]).every((key) => {
    // Match each expected identity and type exactly once in its zone, independent of order.
    // Seat-scoped IDs also rule out sharing between seats (the roster has unique IDs).
    const remaining = new Map(tokenZones[key].map(({ id, type }) => [id, type]));
    for (const { id, type } of actual.tokenZones[key]) {
      if (remaining.get(id) !== type) return false;
      remaining.delete(id);
    }
    return remaining.size === 0;
  });
}
