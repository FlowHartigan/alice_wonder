import { z } from 'zod';
import type { RegionId } from './regions.ts';

function quest<Id extends string>(id: Id, exploitRegionId: RegionId, title: string) {
  return Object.freeze({ id, exploitRegionId, title });
}

// WW-SETUP-004 / WW-COUNT-001 / WW-SETUP-003 J — retrait 2J (#65) et choix initial (#14).
// Relevé TTS EN 2886627193 : titres maison sauf 31000, 31016, 31018 et 31022 (livret FR).
// Les IDs d’application sont stables et privés ; ne pas réaffecter les entrées de cette version.
export const SETUP_QUEST_CATALOG_V1 = Object.freeze({
  version: 1 as const,
  quests: Object.freeze([
    quest('quest-31000', 'jardin-des-fleurs-vivantes', 'Peindre les roses'),
    quest('quest-31001', 'jardin-des-fleurs-vivantes', 'Remporter le croquet du Jardin'),
    quest('quest-31002', 'jardin-des-fleurs-vivantes', 'Se lier d’amitié avec tous'),
    quest('quest-31003', 'jardin-des-fleurs-vivantes', 'Être soi-même'),
    quest('quest-31004', 'jardin-des-fleurs-vivantes', 'Forger l’alliance'),
    quest('quest-31005', 'mare-de-larmes', 'Rassembler une ménagerie'),
    quest('quest-31006', 'mare-de-larmes', 'Se lier d’amitié avec le forgeron aux oiseaux'),
    quest('quest-31007', 'mare-de-larmes', 'La révolution industrielle'),
    quest('quest-31008', 'mare-de-larmes', 'Rallier les faibles'),
    quest('quest-31009', 'mare-de-larmes', 'Merveilles sur merveilles'),
    quest('quest-31010', 'donjon-rouge', 'Poker aux oiseaux, gros enjeux'),
    quest('quest-31011', 'donjon-rouge', 'Collectionner le tarot des bêtes'),
    quest('quest-31012', 'donjon-rouge', 'Le plus étrange des étranges'),
    quest('quest-31013', 'donjon-rouge', 'Champion du Pays des Merveilles'),
    quest('quest-31014', 'donjon-rouge', 'Les plus forts des amis'),
    quest('quest-31015', 'foret-de-tulgey', 'Le prix des meilleures intentions'),
    quest('quest-31016', 'foret-de-tulgey', 'Appel aux palourdes'),
    quest('quest-31017', 'foret-de-tulgey', 'La bande des costauds'),
    quest('quest-31018', 'foret-de-tulgey', 'Les belles et les bêtes'),
    quest('quest-31019', 'foret-de-tulgey', 'Le parangon du chaos'),
    quest('quest-31020', 'comte-de-la-deraison', 'Des choix à rendre fou'),
    quest('quest-31021', 'comte-de-la-deraison', 'Tout n’est rien'),
    quest('quest-31022', 'comte-de-la-deraison', 'Le château changeur'),
    quest('quest-31023', 'comte-de-la-deraison', 'L’étrange quête'),
    quest('quest-31024', 'comte-de-la-deraison', 'Que le plus malin survive'),
    quest('quest-31025', 'foret-de-tulgey', 'Double mission'),
    quest('quest-31026', 'comte-de-la-deraison', 'La fête de non-anniversaire'),
    quest('quest-31027', 'mare-de-larmes', 'Héros du Pays des Merveilles'),
    quest('quest-31028', 'donjon-rouge', 'Une armée sans personne'),
    quest('quest-31029', 'jardin-des-fleurs-vivantes', 'Rallier les bannières'),
  ]),
});

const byId = new Map(SETUP_QUEST_CATALOG_V1.quests.map((entry) => [entry.id, entry] as const));
export const questId = z.enum(SETUP_QUEST_CATALOG_V1.quests.map(({ id }) => id));
export type QuestId = z.infer<typeof questId>;

export const twoPlayerSetupSnapshot = z.strictObject({
  catalogVersion: z.literal(SETUP_QUEST_CATALOG_V1.version),
  questOrder: z.array(questId).length(30).refine((ids) => new Set(ids).size === ids.length, 'ID de Quête dupliqué'),
});
export type TwoPlayerSetupSnapshot = z.infer<typeof twoPlayerSetupSnapshot>;

export function getSetupQuestV1(id: z.infer<typeof questId>) {
  // The enum and the index have the same immutable source.
  return byId.get(id)!;
}
