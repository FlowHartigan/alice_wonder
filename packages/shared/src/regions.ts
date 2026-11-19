const names = Object.freeze({
  'donjon-rouge': 'Donjon rouge',
  'foret-de-tulgey': 'Forêt de Tulgey',
  'jardin-des-fleurs-vivantes': 'Jardin des Fleurs vivantes',
  'mare-de-larmes': 'Mare de Larmes',
  'comte-de-la-deraison': 'Comté de la Déraison',
} as const);

export type RegionId = keyof typeof names;

function neighbors(...ids: RegionId[]): readonly RegionId[] {
  return Object.freeze(ids);
}

// WW-MAP-001 — jeu de base FR : plateau p. 2 et glossaire « Adjacence » p. 22.
export const REGION_CATALOG = Object.freeze({
  version: 1,
  names,
  adjacency: Object.freeze({
    'donjon-rouge': neighbors('comte-de-la-deraison', 'foret-de-tulgey'),
    'foret-de-tulgey': neighbors('donjon-rouge', 'jardin-des-fleurs-vivantes'),
    'jardin-des-fleurs-vivantes': neighbors('foret-de-tulgey', 'mare-de-larmes'),
    'mare-de-larmes': neighbors('jardin-des-fleurs-vivantes', 'comte-de-la-deraison'),
    'comte-de-la-deraison': neighbors('mare-de-larmes', 'donjon-rouge'),
  } satisfies Record<RegionId, readonly RegionId[]>),
  // Circuit géographique, distinct des adjacences. Donjon en tête (p. 4, étape 11).
  clockwise: Object.freeze([
    'donjon-rouge', 'foret-de-tulgey', 'jardin-des-fleurs-vivantes', 'mare-de-larmes', 'comte-de-la-deraison',
  ] satisfies RegionId[]),
});

/** WW-SETUP-004 — à 2J, la tête est le départ avant lancer, juste après l'exclusion (p. 21). */
export function getActiveRegionCircuit(excluded?: RegionId): readonly RegionId[] {
  const { clockwise } = REGION_CATALOG;
  if (excluded === undefined) return clockwise;

  const index = clockwise.indexOf(excluded);
  return Object.freeze([...clockwise.slice(index + 1), ...clockwise.slice(0, index)]);
}

/** Filtre le graphe du plateau, sans relier entre eux les voisins de la Région exclue. */
export function getActiveRegionNeighbors(region: RegionId, excluded?: RegionId): readonly RegionId[] {
  if (region === excluded) return Object.freeze([]);

  const adjacent = REGION_CATALOG.adjacency[region];
  if (excluded === undefined) return adjacent;
  return Object.freeze(adjacent.filter(neighbor => neighbor !== excluded));
}
