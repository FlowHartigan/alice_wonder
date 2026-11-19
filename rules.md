# rules.md — Spécification des règles de Wonderland's War

> **Statut : squelette de travail, PAS une transcription intégrale ni une validation des règles officielles.**
>
> Ce document sera la source de vérité fonctionnelle du moteur de jeu **après validation de chaque section**. Aucune règle marquée `À vérifier` ne doit être codée comme certaine.

Toute évolution de ce référentiel ou de son implémentation suit le [workflow GitHub d'`AGENTS.md`](AGENTS.md#workflow-github-obligatoire) : issue avant le travail, puis pull request et revue indépendante avant fusion. Relier les identifiants `WW-…` concernés à l'issue et à la PR.

## 0. Références, édition et méthode

- **Jeu :** Wonderland's War.
- **Édition de référence :** À confirmer (langue, édition, éventuelles extensions, errata).
- **Nombre de joueurs :** 2 à 5, d'après la présentation de l'éditeur.
- **Structure générale :** trois rounds ; chaque round comprend une phase de Thé et une phase de Guerre, d'après la présentation de l'éditeur.
- **Règles de variantes et extensions :** désactivées tant qu'elles ne sont pas explicitement validées.

Références à consulter :
- https://luckyduckgames.com/france/game/710-wonderland-s-war (page éditeur français et livret)
- https://www.druidcitygames.com/wonderlands-war (éditeur original)
- [Allplay](https://www.allplay.com/board-games/wonderlands-war/) signale des plateaux de faction mis à jour pour le premier tirage anglophone ; leur applicabilité à la boîte FR n'est pas établie.
- Livret physique possédé par l'équipe : à joindre ou référencer pour vérifier la version exacte.

### Format exigé pour documenter chaque règle

```text
ID : WW-XXX-001
Statut : À vérifier | Documentée | Validée | Implémentée | Testée
Source : nom du livret, édition, page, errata pertinent
Déclencheur : quand la règle s'applique
Préconditions : quand l'action est autorisée
Entrées : paramètres et éléments consommés
Résolution : calcul ou transition de jeu, dans l'ordre exact
Informations : publiques / privées
Effets : modifications exactes de l'état
Exceptions : cas limites et départages
Tests : exemples de scénarios à couvrir
```

## 1. Inventaire et préparation de la partie — À vérifier

**WW-SETUP-001** : matériel et quantités selon le nombre de joueurs.

**WW-SETUP-002** : attribution ou choix des factions, pouvoirs de départ et plateaux individuels.

**WW-SETUP-003** : ressources, sacs, réserves, marqueurs, cartes et jetons de départ.

**WW-SETUP-004** : configuration du plateau, des régions et des éléments communs.

**WW-SETUP-005** : premier joueur et ordre de jeu.

## 2. Structure de partie — Validation partielle

**WW-FLOW-001** : la partie comporte trois rounds, chacun avec une phase de Thé et une phase de Guerre. **Confirmé au niveau général par la page de l'éditeur ; le détail des transitions reste à vérifier.**

**WW-FLOW-002** : conditions exactes de passage d'une phase à l'autre — À vérifier.

**WW-FLOW-003** : séquences et opérations de fin de round — À vérifier.

## 3. Phase de Thé — À vérifier

**WW-TEA-001** — À vérifier, p. 6–7, 11 et 22. En début de round les Chefs sont en Bout de Table ; les joueurs se succèdent autour de la table. Déplacer le Chef dans son sens de déplacement jusqu'à une chaise avec carte et sans Chef. Au passage du Bout de Table (au plus une fois par tour), lancer le dé Éclat, garnir les chaises vides non bloquées, puis laisser le joueur choisir sa destination. Alice se déplace en sens inverse.

**WW-TEA-002** — À vérifier, p. 7–9 et 22. Les cartes acquises restent visibles devant le joueur. Résoudre les icônes possibles dans l'ordre choisi par le joueur, y compris les malus obligatoires. Pour une carte divisée, choisir une des deux récompenses ; conserver les effets communs. Pour une carte corrompue, choisir si l'on lance le dé en échange de l'effet qui lui est attaché. Tester les effets communs dans les deux branches.

**WW-TEA-003** — À vérifier, p. 8–9. Ajouter les Alliés gagnés au sac ; en cas de rupture du jeton demandé, choisir un jeton disponible de même niveau. La Forge n'existe qu'en faible. Vérifier la résolution si aucun jeton de niveau équivalent n'est disponible.

**WW-TEA-004** — À vérifier, p. 7–8, 11 et 22. Placer dans une même Région toutes les unités d'une icône d'affectation, avec un choix distinct pour chaque icône. Un Habitant recruté peut remplacer un Partisan ; si la réserve de Partisans est vide, réaffecter une unité déjà en jeu selon la règle. Voir le pouvoir de la Reine de cœur et l'interdiction de la Région retirée à deux.

**WW-TEA-005** — À vérifier, p. 10–11 et 23. Intercaler les déclencheurs de Faction : début de Thé (Poison), changement de trajet (Alice), choix de carte sans déplacement (Chapelier fou), répartition des Partisans (Reine de cœur), partage du résultat du dé (Chat du Cheshire). Voir `WW-FACTION-002`.

**WW-TEA-006** : fin de phase et vérification des conditions.

## 4. Phase de Guerre — À vérifier

**WW-WAR-001** — À vérifier, p. 12, 14, 21 et 24. Partir de Premier combat et parcourir les Régions en sens horaire. Une faction ne participe que si elle a au moins un Chef, un Habitant ou un Partisan dans la Région ; un Château seul ne suffit pas. À deux, ignorer la Région retirée.

**WW-WAR-002** — À vérifier, p. 12, 14 et 21. Force de départ : valeur du Chef présent + Force des Habitants présents + 2 par Château, sans apport des Partisans. Distinguer le combat incontesté du duel contre la Résistance locale.

**WW-WAR-003** — À vérifier, p. 12–13, 22 et 24. Première pioche simultanée obligatoire lors d'un combat disputé. Folie et échec d'abord, puis résoudre les effets des autres jetons, placer ceux qui restent actifs et avancer le repère de Force selon la valeur résolue. Les choix de piocher/abandonner ne doivent pas être diffusés avant l'engagement de tous les joueurs concernés.

**WW-WAR-004** — À vérifier, p. 12–13, 21–22. Abandon irréversible après la première pioche : la Force acquise compte toujours. Arrêter si tous ont échoué ou abandonné, si le seul joueur encore en lice est seul en tête, ou si au moins un atteint 25 (égalité si plusieurs au cours de la même pioche). À deux, ajouter l'arrêt lorsque le dernier ou seul joueur en lice atteint le seuil de Résistance locale.

**WW-WAR-005** — À vérifier, p. 10, 13 et 22–24. Folie : placer sur la piste et perdre une unité par icône, Chef retiré en dernier. Le Bouclier intact peut annuler le jeton et le renvoyer au sac, en se brisant. L'échec faute d'unités annule la Force, épuise les Actifs, exclut le joueur du combat et répare le Bouclier. Le Poison fait perdre une unité puis retourne au Jabberwocky (ou au sac si contré), sans avancer la piste de Folie.

**WW-WAR-006** — À vérifier, p. 13 et 22–23. Ordre si nécessaire : Folie et échec, effets sur soi et ses jetons, puis effets sur des adversaires. Si un ordre entre joueurs est requis : moins de PV, puis plus d'Éclats. Vérifier égalité persistante et interactions texte par texte.

**WW-WAR-007** — À vérifier, p. 14–15 et 21. Rang selon la Force, hors échecs ; le premier gagne les PV régionaux du round et construit s'il n'a pas déjà de Château. Le deuxième gagne la moitié des PV. Égalité au premier rang : chaque ex æquo choisit PV ou construction, sans deuxième prix ; égalité au deuxième : partage arrondi au supérieur. À 3–5, présence unique : choisir PV ou construction, sans pioche ni Pari. Tester le cas d'un Château déjà présent lors d'un choix et les exceptions de `WW-COUNT-001`.

**WW-WAR-008** — À vérifier, p. 14–15. Ordre indiqué : conquête/Château, Quêtes, capacités de fin, Forge, Paris, conclusion. Épuiser les Actifs restants, remettre les repères de Force au départ, laisser la Folie sur sa piste, continuer vers la Région suivante.

**WW-WAR-009** — À vérifier, p. 12, 14–15 et 21. À 3–5, après détermination de la Force de départ d'un combat disputé, les non-participants peuvent miser simultanément et en secret sur le vainqueur. Réussite : un Allié faible choisi ; erreur : un Éclat ; égalité en tête : ni gain ni pénalité. Vérifier la résolution des paris si tous les combattants échouent.

## 5. Sac et jetons — À vérifier

**WW-BAG-001** — À vérifier, p. 2–5 et 22. Cinq familles : Alliés (Forge comprise), Faction (Chef et Artefact), Objet, Folie et Poison. Inventorier forces, exemplaires et visuels du tirage avant de créer le catalogue.

**WW-BAG-002** — À vérifier, p. 8, 13, 15 et 22. Un jeton gagné va par défaut au sac. La fin du combat déplace les Actifs vers les Épuisés sauf effet contraire ; un jeton forgé va sur une piste Forge, tandis qu'un jeton définitivement défaussé retourne à la réserve commune. Tester la conservation de chaque instance dans une seule zone.

**WW-BAG-003** : conditions et méthode de reconstitution / remise à zéro du sac.

**WW-BAG-004** : visibilité des informations : quantités connues et ordre caché.

**WW-BAG-005** — À vérifier, p. 9–10, 13 et 22–23. Les jeux d'Alliés A à D attribuent des effets différents aux mêmes familles de jetons ; la force modifiée d'un jeton ne se conserve pas pour une future pioche. Dresser le catalogue des effets et dépendances, y compris Folie et Poison (`WW-WAR-005`).

## 6. Régions, unités et châteaux — À vérifier

**WW-MAP-001** — À vérifier, p. 4, 7, 21–22 et plateau. Cinq Régions dans le jeu de base ; ajouter au graphe l'adjacence entre Mare de Larmes et Comté de la Déraison. Relever l'ordre horaire, les noms et la géométrie sur le plateau physique.

**WW-MAP-002** — À vérifier, p. 7–8, 12–13, 21–22. Les Partisans, Habitants et Chefs sont des unités ; les Châteaux n'en sont pas. Les placements liés au Thé et les retraits liés au combat sont décrits par `WW-TEA-004` et `WW-WAR-005`. Les unités perdues ne restent pas dans la Région ; vérifier la destination et l'éligibilité des Chefs aux effets spécifiques.

**WW-MAP-003** — À vérifier, p. 8, 12, 14–15 et 21. Maximum un Château par faction et par Région ; construction par effet ou conquête. Il donne 2 de Force de départ à son propriétaire participant et des PV en fin de partie, dépendants de la piste de Forge. À deux, construction en deux étapes et valeur finale des seuls Châteaux redressés.

**WW-MAP-004** — À vérifier, p. 12, 14 et 21. Le score de conquête est imprimé par Région et par round sur le marqueur assigné ; utiliser `WW-WAR-007` pour le classement et la récompense. Un Château ne donne pas à lui seul le droit de participer au combat suivant.

## 7. Factions et asymétrie — À vérifier

**WW-FACTION-001** — À vérifier pour l'édition retenue, p. 10–11. Jeu de base FR : Alice, Chapelier fou, Reine de cœur, Jabberwocky, Chat du Cheshire.

**WW-FACTION-002** — À vérifier, p. 8, 10–11, 21–23. Alice inverse son sens au Thé ; la Reine répartit ses Partisans ; le Chapelier peut une fois par Thé remplir les chaises vides puis prendre une carte sans se déplacer ; le Chat peut céder un Éclat sur un résultat de 2 ou 3 ; le Jabberwocky dispose du Poison. Relever les quatre capacités de chaque plateau ainsi que les différences côté 2J.

**WW-FACTION-003** — À vérifier, p. 8, 15 et 22. Retirer le disque d'une capacité choisie lorsqu'un effet permet de la débloquer. Une capacité débloquée à la Forge ne s'applique pas au combat en cours. La piste Force du Chef est distincte de la Force de combat ; à 6, l'effet Thé permet de défausser un Éclat à la place.

**WW-FACTION-004** — À vérifier, p. 13 et 23. Appliquer les priorités de `WW-WAR-006`, puis les clarifications propres aux capacités ; prévoir une fiche et des tests pour chaque interaction.

Créer une fiche distincte pour chaque faction après confirmation de l'édition :

```text
Faction : [nom officiel]
Capacité : [nom]
ID : WW-FACTION-...
Moment : ...
Conditions : ...
Effets : ...
Limites : ...
Source et tests : ...
```

## 8. Cartes, quêtes et améliorations — À vérifier

**WW-CARD-001** — À vérifier, p. 2–5, 8–9 et 21. Distinguer Thé par round, Pays des Merveilles (Habitants et Objets), Quêtes, Paris par faction et références Alliés. Remplacer immédiatement une carte prise au marché Pays des Merveilles par le dessus du paquet ; cartes 2J à retirer selon `WW-COUNT-001`.

**WW-CARD-002** — À vérifier, p. 8–9, 22–24. Inventorier les icônes : affectation, jetons, Éclats, Bouclier, Pays des Merveilles, capacité, Château, Force du Chef, Folie, Quête. Un Habitant acheté est placé immédiatement ; un Objet gagné donne les deux jetons associés. Créer des fiches d'effets unitaires et de cartes composées.

**WW-QUEST-001** — À vérifier, p. 5, 8, 14–15, 20 et 22. Quête non révélée dans le journal privé. À la fin d'un combat, annoncer au plus un Exploit admissible et révéler sa carte (exceptions par capacité). Évaluer les Objectifs en fin de partie ; ceux portant sur des jetons incluent sac, Actifs, Épuisés et Forge. Un même élément peut satisfaire plusieurs Objectifs. Voir `WW-END-001` pour le score.

**WW-UPGRADE-001** — À vérifier, p. 15 et 20–22. À la fin d'un combat éligible, la case de Force Forge et les jetons Forge actifs donnent des occasions facultatives. Déplacer un jeton Actif vers la première case libre d'une piste choisie, appliquer sa récompense et gagner l'Artefact si la piste est complétée. Vérifier les récompenses partagées entre deux pistes et les interactions lorsque le jeton forgé est une Forge.

## 9. Score, fin de partie et départages — À vérifier

**WW-SCORE-001** — À vérifier, p. 9, 14–15 et 23. Séparer PV gagnés pendant la partie (conquête, Forge, effets, etc.) et calcul différé (Châteaux, Quêtes, Éclats). Cataloguer les effets de score qui modifient les PV pendant une résolution.

**WW-SCORE-002** — À vérifier, p. 6, 15 et 22. Enregistrer un total de PV de piste hors calcul final ; le marqueur 50+/100+ représente les tours de piste, pas un bonus de PV. Tester les franchissements de 50 et 100 sans double comptage.

**WW-END-001** : condition de fin de partie et dernier calcul des scores.

**WW-END-002** : départage en cas d'égalité.

## 10. Règles spécifiques selon le nombre de joueurs — À vérifier

**WW-COUNT-001** : configuration et règles à deux joueurs.

**WW-COUNT-002** : différences éventuelles pour 3, 4 et 5 joueurs.

## 11. Interface et automatisations dérivées des règles

Pour chaque action jouable, l'implémentation doit préciser :
- Qui peut agir et à quel moment.
- Ce que les autres voient avant, pendant et après l'action.
- Quelles informations sont cachées.
- Quels choix sont obligatoires et lesquels sont facultatifs.
- Quelle réponse le serveur renvoie en cas d'action invalide.
- Comment une partie est sauvegardée ou reprise au milieu de cette étape.

## 12. Questions ouvertes à trancher

1. Quelle édition exacte du jeu physique doit être reproduite ?
2. Les extensions ou modules optionnels sont-ils inclus au lancement ?
3. Les illustrations et ressources du jeu sont-elles disponibles avec une autorisation d'usage numérique ?
4. Quels errata officiels doivent être pris en compte ?
5. Quels textes et traductions doivent être utilisés dans l'interface ?

## 13. Tableau de suivi

| Domaine | Documentation | Implémentation | Tests |
|---|---|---|---|
| Préparation | À vérifier | Non démarrée | Non démarrés |
| Phase de Thé | À vérifier | Non démarrée | Non démarrés |
| Phase de Guerre | À vérifier | Non démarrée | Non démarrés |
| Sacs et jetons | À vérifier | Non démarrée | Non démarrés |
| Régions et châteaux | À vérifier | Non démarrée | Non démarrés |
| Factions et pouvoirs | À vérifier | Non démarrée | Non démarrés |
| Cartes et quêtes | À vérifier | Non démarrée | Non démarrés |
| Scores et fin de partie | À vérifier | Non démarrée | Non démarrés |
| Variantes à deux joueurs | À vérifier | Non démarrée | Non démarrés |

---

**Rappel :** une fonctionnalité ne doit jamais être marquée conforme aux règles officielles tant que le comportement n'a pas été vérifié contre une source identifiée et testé.
