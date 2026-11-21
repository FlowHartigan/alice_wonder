import { z } from 'zod';
import type { InitialResourcesSnapshot } from './initial-resources.ts';

// WW-SETUP-001/004, étape 6 : inventaire avant N, pas de règles de prise ou de dépense.
const madnessInventory = { single: 29, double: 5 };
export const INITIAL_SHARD_BANK = Object.freeze({ 1: 30, 5: 10 } as const);

export const centralReservesSnapshotV10 = z.strictObject({
  undistributedMadness: z.strictObject({ single: z.int().nonnegative(), double: z.int().nonnegative() }),
  shardBank: z.strictObject({ 1: z.literal(INITIAL_SHARD_BANK[1]), 5: z.literal(INITIAL_SHARD_BANK[5]) }),
  // The same die is already represented by the snapshot's versioned firstBattleRoll.
});
type CentralReservesV10 = z.infer<typeof centralReservesSnapshotV10>;

/** Read the actual bags of the frozen seats; their contents and order remain authoritative. */
export function countInitialCentralReserves(resources: InitialResourcesSnapshot): CentralReservesV10 {
  const undistributedMadness = { ...madnessInventory };
  for (const { tokenZones: { bag } } of resources) {
    for (const { type } of bag) {
      if (type === 'madness-single') undistributedMadness.single--;
      if (type === 'madness-double') undistributedMadness.double--;
    }
  }
  return { undistributedMadness, shardBank: { ...INITIAL_SHARD_BANK } };
}

// WW-SETUP-001/003/004 (step 3), WW-COUNT-001/002. Only Forge has a known level.
const forgeInventory = 25;
const otherAllyTotal = 19;
const otherAllyTotals = z.strictObject({
  flamingo: z.literal(otherAllyTotal), creature: z.literal(otherAllyTotal), redTower: z.literal(otherAllyTotal),
  rose: z.literal(otherAllyTotal), cardSoldier: z.literal(otherAllyTotal),
});
export const centralReservesSnapshot = centralReservesSnapshotV10.extend({
  forgeReserve: z.array(z.strictObject({ id: z.string(), type: z.literal('forge-1') })).max(forgeInventory),
  otherAllyTotals,
});
type AllyStock = Pick<z.infer<typeof centralReservesSnapshot>, 'forgeReserve' | 'otherAllyTotals'>;

// Seat tokens use UUID-prefixed IDs. The reserve has a disjoint namespace.
const reserveForgeId = (index: number) => `central:forge-1:${index + 1}`;

function remainingForge(resources: InitialResourcesSnapshot): number {
  let remaining = forgeInventory;
  for (const { tokenZones: { bag } } of resources) {
    for (const { type } of bag) if (type === 'forge-1') remaining--;
  }
  return remaining;
}

/** Only called with starting holdings constructed at launch or validated by the legacy snapshot. */
export function initialAllyStock(resources: InitialResourcesSnapshot): AllyStock {
  return {
    forgeReserve: Array.from({ length: remainingForge(resources) }, (_, i) => ({ id: reserveForgeId(i), type: 'forge-1' })),
    otherAllyTotals: {
      flamingo: otherAllyTotal, creature: otherAllyTotal, redTower: otherAllyTotal,
      rose: otherAllyTotal, cardSoldier: otherAllyTotal,
    },
  };
}

/** The snapshot schema separately checks the exact per-seat holdings in every zone. */
export function matchesForgeReserve(resources: InitialResourcesSnapshot, reserve: AllyStock['forgeReserve']): boolean {
  if (reserve.length !== remainingForge(resources)) return false;
  const ids = new Set(reserve.map(({ id }) => id));
  for (let i = 0; i < reserve.length; i++) if (!ids.has(reserveForgeId(i))) return false;
  return true;
}
