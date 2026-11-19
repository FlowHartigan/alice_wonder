import { describe, expect, it } from 'vitest';
import { resolveTwoPlayerRegionSetup } from '@wonderland/game-engine';
import type { TwoPlayerRegionSetupInput } from '@wonderland/game-engine';
import { REGION_CATALOG, REGION_SCORE_MARKER_CATALOG } from '@wonderland/shared';
import type { RegionId } from '@wonderland/shared';

const { clockwise, adjacency } = REGION_CATALOG;
const [donjon, foret, jardin, mare, comte] = clockwise;
const markerIds = REGION_SCORE_MARKER_CATALOG.markers.map(({ id }) => id);
const scores = Object.freeze({
  // Deliberately not in circuit order and not assigned by catalogue position.
  placements: Object.freeze([jardin, comte, donjon, mare, foret].map((regionId, i) => (
    Object.freeze({ regionId, markerId: markerIds[5 - i] })
  ))),
  storedMarkerId: markerIds[0],
});

// Synthetic distribution. Interleave the cards; IDs carry no region information.
const counts = [2, 4, 5, 8, 11];
const deck = Object.freeze(Array.from({ length: 11 }, (_, i) => (
  clockwise.filter((_, j) => i < counts[j])
)).flat().map((exploitRegionId, i) => Object.freeze({ id: `test-${i + 1}`, exploitRegionId })));

function deckWithTop(regionId: RegionId) {
  const topIndex = deck.findIndex(quest => quest.exploitRegionId === regionId);
  return Object.freeze([deck[topIndex], ...deck.slice(0, topIndex), ...deck.slice(topIndex + 1)]);
}

describe('Retrait initial 2J (WW-SETUP-004 / WW-COUNT-001 / WW-MAP-004)', () => {
  it.each(clockwise)('révèle %s et conserve les 30 Quêtes et les six marqueurs sans les déplacer', regionId => {
    const shuffledQuestDeck = deckWithTop(regionId);
    const input = Object.freeze({ shuffledQuestDeck, initialRegionScores: scores });
    const before = structuredClone(input);
    const result = resolveTwoPlayerRegionSetup(input);
    expect(result.excludedRegionId).toBe(regionId);
    expect(result.revealedQuest).toBe(shuffledQuestDeck[0]);
    expect(result.excludedQuests[0]).toBe(result.revealedQuest);
    expect(result.excludedQuests).toHaveLength(counts[clockwise.indexOf(regionId)]);

    const expectedExcluded = shuffledQuestDeck.filter(quest => quest.exploitRegionId === regionId);
    const expectedRemaining = shuffledQuestDeck.filter(quest => quest.exploitRegionId !== regionId);
    expect(result.excludedQuests).toEqual(expectedExcluded);
    expect(result.remainingQuestDeck).toEqual(expectedRemaining);
    result.excludedQuests.forEach((quest, i) => expect(quest).toBe(expectedExcluded[i]));
    result.remainingQuestDeck.forEach((quest, i) => expect(quest).toBe(expectedRemaining[i]));
    const allIds = [...result.excludedQuests, ...result.remainingQuestDeck].map(({ id }) => id);
    expect(allIds).toHaveLength(30);
    expect(new Set(allIds)).toEqual(new Set(deck.map(({ id }) => id)));

    const { placements, excludedPlacement, storedMarkerId } = result.regionScores;
    expect(excludedPlacement).toBe(scores.placements.find(placement => placement.regionId === regionId));
    expect(storedMarkerId).toBe(scores.storedMarkerId);
    const expectedPlacements = scores.placements.filter(placement => placement.regionId !== regionId);
    expect(placements).toEqual(expectedPlacements);
    placements.forEach((placement, i) => expect(placement).toBe(expectedPlacements[i]));
    expect([...placements.map(({ markerId }) => markerId), excludedPlacement.markerId, storedMarkerId].sort())
      .toEqual([...markerIds].sort());
    expect(resolveTwoPlayerRegionSetup(input)).toEqual(result);
    expect(input).toEqual(before);
  });

  it('choisit uniquement selon le dessus de la pioche, sans supposer une ventilation sur cinq Régions', () => {
    const resolve = (shuffledQuestDeck: typeof deck) => resolveTwoPlayerRegionSetup({ shuffledQuestDeck, initialRegionScores: scores });
    const withoutDonjon = resolve(deck);
    const withoutForet = resolve(deckWithTop(foret));
    expect(withoutDonjon.excludedRegionId).toBe(donjon);
    expect(withoutForet.excludedRegionId).toBe(foret);
    expect(withoutDonjon.remainingQuestDeck).toHaveLength(28);
    expect(withoutForet.remainingQuestDeck).toHaveLength(26);
    expect(withoutDonjon.activeRegionCircuit).toEqual([foret, jardin, mare, comte]);

    const twoRegions = deck.map((quest, i) => ({ ...quest, exploitRegionId: i === 0 ? donjon : mare }));
    expect(resolve(twoRegions).remainingQuestDeck).toEqual(twoRegions.slice(1));
  });

  it.each(clockwise)('filtre le circuit et le graphe pour %s sans créer d’arête', regionId => {
    const originalMap = structuredClone(REGION_CATALOG);
    const result = resolveTwoPlayerRegionSetup({ shuffledQuestDeck: deckWithTop(regionId), initialRegionScores: scores });
    const { activeRegionCircuit, activeRegionNeighbors } = result;
    const i = clockwise.indexOf(regionId);
    expect(activeRegionCircuit).toEqual([...clockwise.slice(i + 1), ...clockwise.slice(0, i)]);
    expect(activeRegionNeighbors[regionId]).toEqual([]);
    for (const activeId of activeRegionCircuit) {
      expect(activeRegionNeighbors[activeId]).toEqual(adjacency[activeId].filter(neighbor => neighbor !== regionId));
    }
    // The last region loops to the first in the circuit, without a graph edge in either direction.
    const first = activeRegionCircuit[0];
    const last = activeRegionCircuit[activeRegionCircuit.length - 1];
    expect(activeRegionNeighbors[last]).not.toContain(first);
    expect(activeRegionNeighbors[first]).not.toContain(last);
    expect(REGION_CATALOG).toEqual(originalMap);
  });

  it.each([
    ['pas un tableau', { ...deck, length: 30 }],
    ['incomplète', deck.slice(0, -1)],
    ['surnuméraire', [...deck, { ...deck[0], id: 'test-supplementaire' }]],
    ['creuse', Array(30)],
    ['carte absente', [...deck.slice(0, -1), null]],
    ['ID dupliqué sur deux Régions', [...deck.slice(0, -1), { ...deck[29], id: deck[0].id }]],
    ['ID non textuel', [...deck.slice(0, -1), { ...deck[29], id: 30 }]],
    ['ID blanc', [...deck.slice(0, -1), { ...deck[29], id: '  ' }]],
    ['Région inconnue', [...deck.slice(0, -1), { ...deck[29], exploitRegionId: 'inconnue' }]],
    ['Région héritée du prototype du catalogue', [...deck.slice(0, -1), { ...deck[29], exploitRegionId: 'constructor' }]],
  ])('refuse la pioche hors contrat : %s', (_, invalidDeck) => {
    expect(() => resolveTwoPlayerRegionSetup({
      shuffledQuestDeck: invalidDeck as TwoPlayerRegionSetupInput['shuffledQuestDeck'], initialRegionScores: scores,
    })).toThrow(TypeError);
  });

  const [a, b, ...otherPlacements] = scores.placements;
  it.each([
    ['marqueur rangé manquant', { placements: scores.placements }],
    ['seulement quatre placements', { ...scores, placements: scores.placements.slice(1) }],
    ['Région en double', { ...scores, placements: [a, { ...b, regionId: a.regionId }, ...otherPlacements] }],
    ['Région inconnue', { ...scores, placements: [{ ...a, regionId: 'inconnue' }, b, ...otherPlacements] }],
    ['marqueur en double', { ...scores, placements: [a, { ...b, markerId: a.markerId }, ...otherPlacements] }],
    ['marqueur rangé déjà posé', { ...scores, storedMarkerId: a.markerId }],
    ['marqueur inconnu', { ...scores, storedMarkerId: 'marqueur-inconnu' }],
    ['champ de retrait inattendu', { ...scores, excludedPlacement: a }],
    ['champ de placement inattendu', { ...scores, placements: [{ ...a, points: 0 }, b, ...otherPlacements] }],
  ])('refuse l’inventaire initial hors contrat : %s', (_, invalidScores) => {
    expect(() => resolveTwoPlayerRegionSetup({
      shuffledQuestDeck: deck,
      initialRegionScores: invalidScores as TwoPlayerRegionSetupInput['initialRegionScores'],
    })).toThrow(/Inventaire initial/);
  });
});
