import type { QuestId } from '@wonderland/shared/lobby-storage';

// #14 — reformulations FR non officielles du relevé TTS EN 2886627193 ; affichage seulement.
const finalStrength = 'Force finale égale à 3, 4, 9 ou 10.';
const lastLeaderOrArtifact = 'Le dernier jeton encore Actif est un jeton Chef de Faction ou Artefact.';
const lastStrengthOne = 'Le dernier jeton encore Actif a une Force initiale de 1, avant bonus de combat.';
const forgeSpace = 'Le repère de Force termine sur une case marquée Forge.';
const activeCount = 'Terminer avec exactement 2 ou 6 jetons Actifs.';

export const INITIAL_QUEST_TEXT_V1: Record<QuestId, readonly [exploit: string, objective: string, toConfirm?: string]> = {
  'quest-31000': [finalStrength, 'Au moins 7 jetons Allié au total parmi ces types : Rose et Carte Soldat.'],
  'quest-31001': [lastLeaderOrArtifact, 'Au moins 7 jetons Allié au total parmi ces types : Rose et Flamant rose.'],
  'quest-31002': [lastStrengthOne, 'Au moins un jeton de chacun des six types d’Allié, Forge comprise.'],
  'quest-31003': [forgeSpace, 'Au moins 4 cartes Thé répondant au critère « pictogramme Allié au choix ».'],
  'quest-31004': [activeCount, 'Avoir forgé au moins 3 jetons Allié d’un même type.'],
  'quest-31005': [finalStrength, 'Au moins 7 jetons Allié au total parmi ces types : Créature et Flamant rose.'],
  'quest-31006': [lastLeaderOrArtifact, 'Au moins 7 jetons Allié au total parmi ces types : Tour rouge et Flamant rose.'],
  'quest-31007': [lastStrengthOne, 'Avoir complété au moins 3 pistes de Forge.'],
  'quest-31008': [forgeSpace, 'Avoir débloqué 4 capacités de Faction, soit toutes les capacités.'],
  'quest-31009': [activeCount, 'Avoir au moins 5 de Force du Chef.'],
  'quest-31010': [finalStrength, 'Au moins 7 jetons Allié au total parmi ces types : Carte Soldat et Flamant rose.'],
  'quest-31011': [lastLeaderOrArtifact, 'Au moins 7 jetons Allié au total parmi ces types : Créature et Carte Soldat.'],
  'quest-31012': [lastStrengthOne, 'Posséder au moins 3 cartes du marché (Habitants et/ou Objets).'],
  'quest-31013': [activeCount, 'Avoir accompli des Exploits dans au moins 3 Régions distinctes.'],
  'quest-31014': [forgeSpace, 'Posséder au moins 5 jetons Allié forts (deux points).'],
  'quest-31015': [forgeSpace, 'Posséder au moins 5 cartes Quête dans son journal, révélées ou non.'],
  'quest-31016': [activeCount, 'Avoir forgé au moins 3 types distincts de jetons Allié.'],
  'quest-31017': [finalStrength, 'Au moins 7 jetons Allié au total parmi ces types : Créature et Tour rouge.'],
  'quest-31018': [lastLeaderOrArtifact, 'Au moins 7 jetons Allié au total parmi ces types : Créature et Rose.'],
  'quest-31019': [lastStrengthOne, 'Avoir 3 Châteaux dans des Régions adjacentes. La forme d’adjacence exigée reste à confirmer.',
    'L’adjacence du plateau est définie p. 22, mais le recto EN ne précise pas si les trois Régions doivent être mutuellement adjacentes ou former une chaîne. À deux, vérifier aussi si un Château incliné compte pour cet Objectif.'],
  'quest-31020': [lastLeaderOrArtifact, 'Au moins 4 cartes Thé répondant au critère « carte divisée ou corrompue ».'],
  'quest-31021': [finalStrength, 'Au moins 7 jetons Allié au total parmi ces types : Carte Soldat et Tour rouge.'],
  'quest-31022': [lastStrengthOne, 'Au moins 7 jetons Allié au total parmi ces types : Rose et Tour rouge.'],
  'quest-31023': [forgeSpace, 'Avoir au plus 5 Éclats.'],
  'quest-31024': [activeCount, 'Au moins 4 cartes Thé répondant au critère « pictogramme du dé Éclat ».',
    'Vérifier si les dés liés à la corruption comptent pour l’Objectif, y compris lorsque le joueur les a refusés.'],
  'quest-31025': [lastLeaderOrArtifact, 'Avoir accompli au moins 2 Exploits dans une même Région.',
    'Le recto exige une Région commune aux deux Exploits, sans imposer la Forêt de Tulgey. Vérifier si l’Exploit de cette Quête peut compter dans sa propre paire.'],
  'quest-31026': [finalStrength, 'Posséder des jetons Allié forts (deux points) d’au moins 3 types distincts.'],
  'quest-31027': [lastStrengthOne, 'Au moins 3 cartes Thé répondant au critère « pictogramme Force du Chef ou Bouclier ».'],
  'quest-31028': [forgeSpace, 'Au moins 4 cartes Thé répondant au critère « sans pictogramme d’affectation de Partisans ».',
    'Vérifier le traitement d’une carte qui autoriserait une affectation uniquement dans une branche facultative.'],
  'quest-31029': [activeCount, 'Au moins 4 cartes Thé répondant au critère « 3 Partisans indiqués ».',
    'Vérifier si l’Objectif exige une icône imprimée « 3 » ou un total de 3 au moyen de plusieurs icônes, et le traitement d’une branche facultative.'],
};
