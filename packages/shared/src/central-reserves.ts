import { z } from 'zod';
import type { InitialResourcesSnapshot } from './initial-resources.ts';

// WW-SETUP-001/004, étape 6 : inventaire avant N, pas de règles de prise ou de dépense.
const madnessInventory = { single: 29, double: 5 };
export const INITIAL_SHARD_BANK = Object.freeze({ 1: 30, 5: 10 } as const);

export const centralReservesSnapshot = z.strictObject({
  undistributedMadness: z.strictObject({ single: z.int().nonnegative(), double: z.int().nonnegative() }),
  shardBank: z.strictObject({ 1: z.literal(INITIAL_SHARD_BANK[1]), 5: z.literal(INITIAL_SHARD_BANK[5]) }),
  // The same die is already represented by the snapshot's versioned firstBattleRoll.
});
type CentralReserves = z.infer<typeof centralReservesSnapshot>;

/** Read the actual bags of the frozen seats; their contents and order remain authoritative. */
export function countInitialCentralReserves(resources: InitialResourcesSnapshot): CentralReserves {
  const undistributedMadness = { ...madnessInventory };
  for (const { tokenZones: { bag } } of resources) {
    for (const { type } of bag) {
      if (type === 'madness-single') undistributedMadness.single--;
      if (type === 'madness-double') undistributedMadness.double--;
    }
  }
  return { undistributedMadness, shardBank: { ...INITIAL_SHARD_BANK } };
}
