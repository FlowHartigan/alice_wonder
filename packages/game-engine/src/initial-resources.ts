import type { IndividualResourcesSetupView } from '@wonderland/shared';
import { startingSeatResources } from '@wonderland/shared/lobby-storage';
import type { InitialResourcesSnapshot, LobbyState } from '@wonderland/shared/lobby-storage';
import { shuffle } from './game.ts';
import type { RandomSource } from './game.ts';

/** The validated roster is in frozen seat order, independent of J1 or connections. */
export function distributeInitialResources(players: LobbyState['players'], random: RandomSource): InitialResourcesSnapshot {
  return players.map(({ id, faction }) => {
    if (faction === null) throw new Error('Dotation impossible sans faction');
    const seat = startingSeatResources(id, faction, players.length);
    seat.tokenZones.bag = shuffle(seat.tokenZones.bag, random);
    return seat;
  });
}

/** WW-BAG-004: no instances or token types cross the public boundary, even for the owner. */
export function projectInitialResources(resources: InitialResourcesSnapshot): IndividualResourcesSetupView {
  return resources.map(({
    playerId, faction, boardFace, supportersInReserve, supportersOnThirdForgeTrack, castlesInReserve,
    coveredAbilities, leaderStrength, shield, victoryPoints, combat, tokenZones,
  }) => ({
    playerId, faction, boardFace, supportersInReserve, supportersOnThirdForgeTrack, castlesInReserve,
    coveredAbilities, leaderStrength, shield, victoryPoints, combat,
    artifactsOnForge: tokenZones.forgeRewards.length, bagTokenCount: tokenZones.bag.length,
    poisonInReserve: tokenZones.poisonReserve.length, activeTokenCount: tokenZones.active.length,
    exhaustedTokenCount: tokenZones.exhausted.length, madnessTrackTokenCount: tokenZones.madnessTrack.length,
  }));
}
