# Couverture des règles

Référentiel : [`rules.md`](../rules.md). Les pages renvoient au livret FR du jeu de base `LKY WWR-R01-FR`, édition confirmée. `Validée` porte sur le périmètre documentaire indiqué dans la dernière colonne, pas sur une boîte ni sur un moteur. `Testé` désigne les tests d'implémentation, pas la recette documentaire ci-dessous.

| Domaine | Identifiants | Source FR / prochaine vérification | Documentation | Implémenté | Testé | Validé |
|---|---|---|---|---|---|---|
| Inventaire | [`WW-SETUP-001`](../rules.md#ww-setup-001--inventaire) | p. 2–3, 8 et 22 ; fiche éditeur ; rapprocher lots, réserves et pièces écartées | Documentée | — | — | Validée : totaux de référence, pas le catalogue par exemplaire |
| Factions au départ | [`WW-SETUP-002`](../rules.md#ww-setup-002--choix-des-factions) | p. 2–3, 5 A, 8, 10–11, 21 ; contrôler lots, face et Poison sur les quatre effectifs | Documentée | — | — | Validée : choix, face et dotations A, pas les fiches des plateaux |
| Ressources initiales | [`WW-SETUP-003`](../rules.md#ww-setup-003--ressources-individuelles-et-quêtes) | p. 3, 5 B–M, 21 ; décompter sacs et pistes, suivre une Quête refusée, contrôler l'enchaînement B–M | Documentée | — | — | Validée : opérations établies B–M ; ordre entre joueurs à J et mains de Pari après K à 3–4J non validés |
| Plateau | [`WW-SETUP-004`](../rules.md#ww-setup-004--plateau-et-réserves-communes) | p. 2–5, 8–9, 21 et plateau FR ; vérifier marché mixte, chaises et Premier combat | Documentée | — | — | Validée : préparation commune et exception régionale ; ordre du filtrage du marché 2J non validé |
| Initiative et Éclats | [`WW-SETUP-005`](../rules.md#ww-setup-005--initiative-et-éclats-du-round-i) | p. 3, 5 N (tableau visuel), 6, 11 ; [décision hôte](decisions.md#décisions) ; simuler J1 non hôte après M | Documentée | — | — | Validée : round I, hors absence d'accord ; pas de validation de l'initiative des rounds suivants |
| Structure générale | `WW-FLOW-001` | p. 6, 15 | Documenté | — | — | — |
| Transitions | `WW-FLOW-002` à `003` | p. 6–7, 15, 21 ; caler l'ordre et les cas de régions écartées | Partiel · À documenter | — | — | — |
| Thé | `WW-TEA-001` à `006` | p. 6–11, 21–22 ; lister les effets, décisions et exceptions | Partiel · À documenter | — | — | — |
| Guerre | `WW-WAR-001` à `009` | p. 12–19, 21–24 ; formaliser pioches, abandons, paris et égalités ; voir le détail 2J ci-dessous | Partiel · À documenter | — | — | — |
| Arrêt des pioches à 2J | [`WW-WAR-004`](../rules.md#ww-war-004--arrêt-des-pioches-à-2j) | FR p. 12–13, 21–22 et 24 ; [recette #47](#recette-documentaire-de-larrêt-des-pioches-à-2j) | Documentée | — | — | Validée pour le projet : première pioche et seul combattant sous le seuil établis sur livret ; égalité et priorité après abandon arbitrées en #47, sans confirmation de l'éditeur |
| Sacs et jetons | `WW-BAG-001` à `005` | p. 2–5, 8–9, 12–15, 22–23 ; inventaire et priorités | Partiel · À documenter | — | — | — |
| Régions et Châteaux | `WW-MAP-001` à `004` | p. 4, 8, 12, 14, 21–22 ; relever le plateau et ses adjacences | Partiel · À documenter | — | — | — |
| Factions | `WW-FACTION-001` à `004` | p. 5, 10–11, 21, 23 et plateaux recto/verso | Partiel · Fiches à documenter | — | — | — |
| Cartes, Quêtes, Forge | `WW-CARD-001` à `002`, `WW-QUEST-001`, `WW-UPGRADE-001` | p. 8–9, 14–15, 20, 22–23 ; inventorier les textes et pictogrammes | Partiel · Catalogue à documenter | — | — | — |
| Score et fin | `WW-SCORE-001` à `002`, `WW-END-001` à `002` | p. 14–15, 21–22 ; confirmer les sources des PV et égalités persistantes | Partiel · À documenter | — | — | — |
| Exceptions 2J | [`WW-COUNT-001`](../rules.md#ww-count-001--exceptions-à-deux-joueurs) | p. 4–5 et 21 ; contrôler Région, Quêtes, Premier combat, exclusions, faces, ressources et cube | Documentée | — | — | Validée : préparation établie seulement ; ni ordre du filtre ni données individuelles non établies ; jeu hors jalon |
| Comparaison 2–5J | [`WW-COUNT-002`](../rules.md#ww-count-002--comparaison-des-effectifs) | p. 2–5 et 21, plateau FR ; recalculer les quatre installations | Documentée | — | — | Validée : bilans aux étapes indiquées, pas les usages ultérieurs ni les quantités non ventilées |

Le statut prêt du salon est une fonctionnalité de l'application, sans identifiant de règle officielle.

## Recette documentaire de la mise en place

[#2](https://github.com/FlowHartigan/alice_wonder/issues/2), 19 novembre 2026. **Résultat : la préparation documentaire 2–5J est validée dans les limites de la matrice.** Les quatre mises en place ont été refaites sur papier à partir du [livret officiel FR](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416), p. 2–5 et 21 (compléments : p. 6–15 et 22–24), et du [plateau du dépôt](../assets/official/plateau-principal-fr.webp), dérivé de la p. 2. Le PDF en cache et le téléchargement de la fiche éditeur ont le même SHA-256 (`96abf54eaf44c1ad71823afb8f025473bb5b9c84d309ae1247d89b5afb5fafaf`). Les pictogrammes des Éclats ont été recomptés sur le rendu p. 5, en distinguant J5 présent à zéro d'un siège absent. Le [contrôle des sources et errata](../rules.md#0-références-édition-et-méthode) n'a pas identifié d'erratum applicable à cette mise en place FR.

Conditions : paquet A (conseillé, pas obligatoire), marché simulé de deux Habitants et un Objet autorisés, Jabberwocky présent et Alice désignée J1 selon l'accord de la table par un hôte en J2. Les dés sont fixés pour suivre le circuit ; ils ne donnent aucun Éclat. Pour chaque effectif : étapes 1–11 (p. 4 et renvoi p. 21 à 2J), puis A–E → F (sac) → G (Bouclier intact) → H (Score) → I (Combat) → J (Quête) → K–M (Paris, aides et Chefs) → N (J1 et Éclats). Au terme de J, chaque joueur a une Quête cachée et sa carte refusée est retournée au paquet avant mélange. À M, les Chefs sont en Bout de Table, aucune unité ni Château n'est en Région et les pistes sont à **Force du Chef 1 / Score 0 / Combat 0**. Les deux paquets Thé suivants restent à 30 cartes chacun. Alice ne change pas l'ordre des sièges, même si son Chef se déplace en sens inverse.

| Effectif | Plateau et Premier combat | Lots et ressources au départ | Éclats et réserve restante |
|---|---|---|---|
| 2 | Bloqueurs 4J + 5J, 11 Thé I visibles, 19 en pioche. Quête du Donjon rouge révélée : retrait du Donjon, de ses Quêtes et de son marqueur ; départ Forêt de Tulgey, dé 2 → Mare de Larmes. 4 Régions, 2 marqueurs écartés ; 19 cartes Pays des Merveilles et 28 − R Quêtes en pioche à l'issue de la préparation. | Face dorée 2J, 2 sacs de 11 (22 jetons) ; 20 Partisans en réserve, 8 sur la Forge, 10 Châteaux en réserve ; 21 Forge communes, 4 Poison au Jabberwocky, 0 Pari, 1 cube de faction inutilisée réservé. | 2/1 ; reste 27 noires et 10 blanches (77 en valeur). |
| 3 | Bloqueurs 4J + 5J, 11 Thé I visibles, 19 en pioche. Départ Donjon rouge, dé 1 → Forêt de Tulgey. 5 Régions, 1 marqueur écarté ; 21 cartes Pays des Merveilles et 27 Quêtes en pioche. | Face ordinaire, 3 sacs de 10 ; 30 Partisans en réserve, 12 sur la Forge, 15 Châteaux en réserve ; 22 Forge communes, 5 Poison au Jabberwocky, 12 Paris pris à A. | 3/2/1 ; reste 24 noires et 10 blanches (74 en valeur). |
| 4 | Bloqueur 5J seul, 12 Thé I visibles, 18 en pioche. Départ Donjon rouge, dé 2 → Jardin des Fleurs vivantes. 5 Régions, 1 marqueur écarté ; 21 cartes Pays des Merveilles et 26 Quêtes en pioche. | Face ordinaire, 4 sacs de 10 ; 40 Partisans en réserve, 16 sur la Forge, 20 Châteaux en réserve ; 21 Forge communes, 6 Poison au Jabberwocky, 16 Paris pris à A. | 3/2/2/1 ; reste 22 noires et 10 blanches (72 en valeur). |
| 5 | Aucun bloqueur, 13 Thé I visibles, 17 en pioche. Départ Donjon rouge, dé 3 → Mare de Larmes. 5 Régions, 1 marqueur écarté ; 21 cartes Pays des Merveilles et 25 Quêtes en pioche. | Face ordinaire, 5 sacs de 10 ; 50 Partisans en réserve, 20 sur la Forge, 25 Châteaux en réserve ; 20 Forge communes, 7 Poison au Jabberwocky, 20 Paris pris à A. | 3/2/2/1/0 ; reste 22 noires et 10 blanches (72 en valeur). J5 participe. |

**Bilans recoupés :** pour `n` joueurs, `29 − 2n` Folie simples et `5 − n` doubles non distribués ; `25 − n` Forge communes sauf à 2J (`25 − 4 = 21`) ; `30 − n` Quêtes en pioche, moins `R` à 2J (Quête révélée incluse dans le retrait, nombre par Région non donné). Les cinq types d'Alliés hors Forge restent en réserve (19 de chaque). Sans Jabberwocky à 2–4J, les 7 Poison restent hors jeu ; à 5J, toutes les factions sont choisies. Au marché, 2 silhouettes et une paire de jetons Objet sont exposées, pas des unités en Région. En 2J, le circuit saute bien le Donjon en passant du Comté à la Forêt ; le cube distinct n'est utilisé qu'au début de la Guerre (3/5/7 par round).

**Contre-épreuves :** à 2J, si l'une des deux cartes interdites figure parmi les trois premières avant filtrage, la p. 21 impose son exclusion mais ne dit pas comment la retirer à ce stade. Filtrer avant mélange a servi à obtenir l'état attendu sur papier, sans valider cet ordre. À 3–4J, les Paris comptés sont ceux pris à A, pas les mains déduites après K. Si la table ne s'accorde pas sur J1, le livret et la décision produit ne désignent ni l'hôte ni un siège par défaut.

### Limites et suites

- **Matériel :** aucune inspection, mise en place physique, vérification du tirage ou comparaison d'encarts. La conformité de la boîte au PDF est supposée pour ce jalon. Restent à relever : composition exacte des lots, correspondances carte–pièces, ventilation faible/fort, nombre de Quêtes par Région et détails des cinq faces 2J (pistes et capacités). Le livret ne suffit pas à établir l'usage des Folie doubles excédentaires, ni l'adjacence créée ou non de part et d'autre d'une Région retirée pour les autres effets.
- **Validation et revue :** aucun mélange ni tirage réel, aucune partie jouée et aucun moteur de mise en place testé. La contre-lecture indépendante à effectuer en revue de PR porte notamment sur la préparation 2J (étapes et exclusions, sans imposer l'ordre du filtre) et la désignation de J1 (critère officiel, décision hôte et distribution horaire).
- **Combat hors recette de préparation :** voir la recette distincte de `WW-WAR-004` ci-dessous.

## Recette documentaire de l'arrêt des pioches à 2J

[#47](https://github.com/FlowHartigan/alice_wonder/issues/47), à la suite de [#44](https://github.com/FlowHartigan/alice_wonder/issues/44). Quatre cas d'arrêt ou de poursuite et un contrôle distinct des récompenses ont été déroulés sur papier au **round II (Résistance à 5)**, sans partie jouée ni test logiciel. Les pages citées sont celles du [livret FR `LKY WWR-R01-FR`](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416). Les deux cas arbitrés par le projet selon la p. 21 FR ne constituent ni un erratum ni une confirmation de l'éditeur.

| Situation | Pioche ou fin du combat | Source et statut |
|---|---|---|
| Seul combattant, Force de départ 5 ou plus (`WW-WAR-003`) | La Force de départ ne déclenche pas l'arrêt : effectuer et résoudre entièrement la première pioche, puis vérifier l'arrêt (ex. départ à 5, jeton résolu à +1, arrêt à 6). L'abandon n'est possible que si le combat continue et qu'une nouvelle pioche est proposée. | **Chronologie établie en #44**, FR p. 12–13, 21–22 et 24. |
| Seul combattant sans adversaire humain : Force de départ 3, puis 4 après résolution complète du premier jeton | Peut repiocher : 4 est en dessous de 5. | **Cas établi en #44**, FR p. 21. |
| Seul combattant sans adversaire humain, encore en lice à 5 après résolution complète de la première pioche | Arrêt sans nouvelle pioche : 5 atteint le seuil. | **Égalité arbitrée en #47**, FR p. 21. |
| A seul en lice à 6, B a abandonné à 8 | Arrêt sans nouvelle pioche pour A : 6 dépasse 5, même si A reste derrière B. B ne repioche pas et conserve 8 pour le classement ; il n'est pas en échec. | **Priorité du seuil arbitrée en #47**, FR p. 21 ; Force conservée, p. 13. |

**Contrôle séparé des récompenses :** pour un combat *déjà terminé*, Force finale 4 = seuil de conquête non rempli ; Force finale 5 = seuil rempli (FR p. 21, [`WW-COUNT-001`](../rules.md#ww-count-001--exceptions-à-deux-joueurs) et `WW-WAR-007`). Cette éligibilité ne détermine ni l'arrêt ni le rang. Aucun changement de barème.

**Suite pour [#22](https://github.com/FlowHartigan/alice_wonder/issues/22) :** implémenter et synchroniser le cycle de combat, puis reprendre les quatre scénarios de pioche ci-dessus dans les tests automatisés. #47 ne modifie ni le moteur ni les règles de classement et de récompense.
