import { describe, expect, it } from 'vitest';
import { getActiveRegionCircuit, getActiveRegionNeighbors, REGION_CATALOG } from '@wonderland/shared';

const donjon = 'donjon-rouge';
const foret = 'foret-de-tulgey';
const jardin = 'jardin-des-fleurs-vivantes';
const mare = 'mare-de-larmes';
const comte = 'comte-de-la-deraison';
const clockwise = [donjon, foret, jardin, mare, comte] as const;

describe('Catalogue des régions du jeu de base FR', () => {
  it('fournit les cinq identifiants, noms et positions dans le circuit horaire', () => {
    expect(REGION_CATALOG.version).toBe(1);
    expect(REGION_CATALOG.names).toEqual({
      [donjon]: 'Donjon rouge',
      [foret]: 'Forêt de Tulgey',
      [jardin]: 'Jardin des Fleurs vivantes',
      [mare]: 'Mare de Larmes',
      [comte]: 'Comté de la Déraison',
    });
    const circuit = getActiveRegionCircuit();
    expect(circuit).toEqual(clockwise);
    expect(circuit[(circuit.indexOf(comte) + 1) % circuit.length]).toBe(donjon);
  });

  it('relève quatre voisinages physiques et la liaison Mare–Comté (WW-MAP-001)', () => {
    expect(REGION_CATALOG.adjacency).toEqual({
      [donjon]: [comte, foret],
      [foret]: [donjon, jardin],
      [jardin]: [foret, mare],
      [mare]: [jardin, comte],
      [comte]: [mare, donjon],
    });
    for (const region of clockwise) {
      const neighbors = getActiveRegionNeighbors(region);
      expect(neighbors).not.toContain(region);
      expect(new Set(neighbors).size).toBe(neighbors.length);
      for (const neighbor of neighbors) {
        expect(clockwise).toContain(neighbor);
        expect(getActiveRegionNeighbors(neighbor)).toContain(region);
      }
    }
  });

  it('sans Donjon rouge, part de la Forêt et atteint la Mare en deux pas (WW-SETUP-004)', () => {
    const circuit = getActiveRegionCircuit(donjon);
    expect(circuit).toEqual([foret, jardin, mare, comte]);
    expect(circuit[0]).toBe(foret);
    expect(circuit[2]).toBe(mare);
    // Le circuit revient du Comté à la Forêt, mais le graphe ne les relie pas.
    expect(circuit[(circuit.indexOf(comte) + 1) % circuit.length]).toBe(foret);
    expect(getActiveRegionNeighbors(comte, donjon)).toEqual([mare]);
    expect(getActiveRegionNeighbors(foret, donjon)).toEqual([jardin]);
  });

  it.each([
    { excluded: donjon, order: [foret, jardin, mare, comte] },
    { excluded: foret, order: [jardin, mare, comte, donjon] },
    { excluded: jardin, order: [mare, comte, donjon, foret] },
    { excluded: mare, order: [comte, donjon, foret, jardin] },
    { excluded: comte, order: [donjon, foret, jardin, mare] },
  ] as const)('exclut $excluded du circuit et du graphe actif sans ajouter de voisin', ({ excluded, order }) => {
    const circuit = getActiveRegionCircuit(excluded);
    expect(circuit).toEqual(order);
    expect(getActiveRegionNeighbors(excluded, excluded)).toEqual([]);
    for (const region of circuit) {
      const neighbors = getActiveRegionNeighbors(region, excluded);
      expect(neighbors).toEqual(getActiveRegionNeighbors(region).filter(neighbor => neighbor !== excluded));
      for (const neighbor of neighbors) {
        expect(getActiveRegionNeighbors(neighbor, excluded)).toContain(region);
      }
    }
  });

  it('préserve le catalogue complet et les vues indépendantes de chaque partie', () => {
    const original = structuredClone(REGION_CATALOG);
    const withoutDonjon = getActiveRegionCircuit(donjon);
    const comteWithoutDonjon = getActiveRegionNeighbors(comte, donjon);
    expect(getActiveRegionCircuit(mare)).toEqual([comte, donjon, foret, jardin]);
    expect(getActiveRegionNeighbors(comte, mare)).toEqual([donjon]);
    expect(withoutDonjon).toEqual([foret, jardin, mare, comte]);
    expect(comteWithoutDonjon).toEqual([mare]);
    expect(REGION_CATALOG).toEqual(original);
    for (const value of [REGION_CATALOG, REGION_CATALOG.names, REGION_CATALOG.adjacency,
      REGION_CATALOG.clockwise, ...Object.values(REGION_CATALOG.adjacency), withoutDonjon, comteWithoutDonjon]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});
