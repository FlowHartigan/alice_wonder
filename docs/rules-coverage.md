# Couverture des règles

Référentiel : [`rules.md`](../rules.md). Les pages renvoient au livret FR du jeu de base `LKY WWR-R01-FR`, édition confirmée. Une référence seule ne signifie pas qu'une règle est entièrement documentée. `Testé` désigne ici les tests de l'implémentation, pas la recette documentaire ci-dessous.

| Domaine | Identifiants | Source FR / prochaine vérification | Documentation | Implémenté | Testé | Validé |
|---|---|---|---|---|---|---|
| Inventaire | [`WW-SETUP-001`](../rules.md#ww-setup-001--inventaire) | p. 2–5, 21–22 ; fiche éditeur ; rapprocher lots distribués et réserves de la boîte | Documentée | — | — | — |
| Factions au départ | [`WW-SETUP-002`](../rules.md#ww-setup-002--choix-des-factions) | p. 2–3, 5, 8, 10–11, 21 ; comparer les cinq plateaux FR recto/verso et les lots | Documentée | — | — | — |
| Ressources initiales | [`WW-SETUP-003`](../rules.md#ww-setup-003--ressources-individuelles-et-quêtes) | p. 3, 5, 10, 21 ; décompter sacs, pistes, Poison et suivre une Quête refusée | Documentée | — | — | — |
| Plateau | [`WW-SETUP-004`](../rules.md#ww-setup-004--plateau-et-réserves-communes) | p. 2–5, 8–9, 21 et plateau FR ; vérifier marché mixte, chaises et Premier combat | Documentée | — | — | — |
| Initiative et Éclats | [`WW-SETUP-005`](../rules.md#ww-setup-005--initiative-et-éclats-du-round-i) | p. 3, 5 (tableau visuel), 6, 11 ; [décision hôte](decisions.md) ; faire relire et rejouer la distribution avec un J1 non hôte | Documentée | — | — | — |
| Structure générale | `WW-FLOW-001` | p. 6, 15 | Documenté | — | — | — |
| Transitions | `WW-FLOW-002` à `003` | p. 6–7, 15, 21 ; caler l'ordre et les cas de régions écartées | Partiel · À documenter | — | — | — |
| Thé | `WW-TEA-001` à `006` | p. 6–11, 21–22 ; lister les effets, décisions et exceptions | Partiel · À documenter | — | — | — |
| Guerre | `WW-WAR-001` à `009` | p. 12–19, 21–24 ; formaliser synchronisation des pioches/paris et égalités | Partiel · À documenter | — | — | — |
| Sacs et jetons | `WW-BAG-001` à `005` | p. 2–5, 8–9, 12–15, 22–23 ; inventaire et priorités | Partiel · À documenter | — | — | — |
| Régions et Châteaux | `WW-MAP-001` à `004` | p. 4, 8, 12, 14, 21–22 ; relever le plateau et ses adjacences | Partiel · À documenter | — | — | — |
| Factions | `WW-FACTION-001` à `004` | p. 5, 10–11, 21, 23 et plateaux recto/verso | Partiel · Fiches à documenter | — | — | — |
| Cartes, Quêtes, Forge | `WW-CARD-001` à `002`, `WW-QUEST-001`, `WW-UPGRADE-001` | p. 8–9, 14–15, 20, 22–23 ; inventorier les textes et pictogrammes | Partiel · Catalogue à documenter | — | — | — |
| Score et fin | `WW-SCORE-001` à `002`, `WW-END-001` à `002` | p. 14–15, 21–22 ; confirmer les sources des PV et égalités persistantes | Partiel · À documenter | — | — | — |
| Exceptions 2J | [`WW-COUNT-001`](../rules.md#ww-count-001--exceptions-à-deux-joueurs) | p. 4–5, 11–15, 21, 23 et matériel 2J ; vérifier filtrage, faces, Résistance et Châteaux | Documentée, faces 2J à relever | — | — | — |
| Comparaison 2–5J | [`WW-COUNT-002`](../rules.md#ww-count-002--comparaison-des-effectifs) | p. 2–5, 7, 14, 21 et plateau FR ; refaire les quatre installations sans extrapoler les Éclats | Documentée | — | — | — |

Le statut prêt du salon est une fonctionnalité de l'application, sans identifiant de règle officielle.

## Recette documentaire de la mise en place

[#2](https://github.com/FlowHartigan/alice_wonder/issues/2), 19 novembre 2026. **Quatre mises en place déroulées sur papier**, à partir du livret FR (p. 2–5 et 21, p. 6–15 et 23 en complément) et du plateau central numérique dérivé de la p. 2. Le tableau d'Éclats a été lu sur le rendu de la p. 5, pas sur le texte extrait. Le PDF local lu est identique à celui retéléchargé depuis la fiche éditeur (SHA-256 `96abf54eaf44c1ad71823afb8f025473bb5b9c84d309ae1247d89b5afb5fafaf`).

Conditions de contrôle : série A, un marché simulé de deux Habitants et un Objet autorisés, Jabberwocky présent et Alice désignée J1 par un hôte qui joue après elle ; les valeurs de dé ci-dessous sont fixées pour suivre le circuit, pas tirées au hasard. À chaque effectif, le marché contient 2 silhouettes et une paire de jetons Objet, il reste 1 Quête face cachée par joueur, les Chefs sont au Bout de Table, aucun Château ni unité n'est en Région et les pistes partent de **Force du Chef 1 / Score 0 / Combat 0**. Les colonnes de §10 ont été recalculées à partir du stock p. 2–3 et des allocations p. 4–5, 21. Les deux paquets Thé suivants restent à 30 cartes chacun.

| Effectif | Plateau et Premier combat | Lots et ressources au départ | Éclats et réserve restante |
|---|---|---|---|
| 2 | Bloqueurs 4J + 5J, 11 Thé I visibles, 19 en pioche. Quête du Donjon rouge révélée : retrait du Donjon, de ses Quêtes et de son marqueur ; départ Forêt de Tulgey, dé 2 → Mare de Larmes. 4 Régions, 2 marqueurs écartés, 19 cartes Pays des Merveilles en pioche après filtrage et révélation. | Face 2J, 2 sacs de 11 (22 jetons) ; 20 Partisans en réserve, 8 sur la Forge, 10 Châteaux en réserve ; 21 Forge communes, 4 Poison au Jabberwocky, 0 Pari, 1 cube neutre. | 2/1 ; reste 27 noires et 10 blanches. |
| 3 | Bloqueurs 4J + 5J, 11 Thé I visibles, 19 en pioche. Départ Donjon rouge, dé 1 → Forêt de Tulgey. 5 Régions, 1 marqueur écarté ; 21 cartes Pays des Merveilles en pioche. | Face ordinaire, 3 sacs de 10 ; 30 Partisans en réserve, 12 sur la Forge, 15 Châteaux en réserve ; 22 Forge communes, 5 Poison au Jabberwocky, 12 Paris. | 3/2/1 ; reste 24 noires et 10 blanches. |
| 4 | Bloqueur 5J seul, 12 Thé I visibles, 18 en pioche. Départ Donjon rouge, dé 2 → Jardin des Fleurs vivantes. 5 Régions, 1 marqueur écarté ; 21 cartes Pays des Merveilles en pioche. | Face ordinaire, 4 sacs de 10 ; 40 Partisans en réserve, 16 sur la Forge, 20 Châteaux en réserve ; 21 Forge communes, 6 Poison au Jabberwocky, 16 Paris. | 3/2/2/1 ; reste 22 noires et 10 blanches. |
| 5 | Aucun bloqueur, 13 Thé I visibles, 17 en pioche. Départ Donjon rouge, dé 3 → Mare de Larmes. 5 Régions, 1 marqueur écarté ; 21 cartes Pays des Merveilles en pioche. | Face ordinaire, 5 sacs de 10 ; 50 Partisans en réserve, 20 sur la Forge, 25 Châteaux en réserve ; 20 Forge communes, 7 Poison au Jabberwocky, 20 Paris. | 3/2/2/1/0 ; reste 22 noires et 10 blanches. J5 participe. |

Contrôles complémentaires sur papier : sans Jabberwocky à 2–4, les 7 Poison restent hors jeu ; à 5, toutes les factions jouent. Le lancement du dé pour Premier combat ne modifie aucune dotation d'Éclats. Une fois le Donjon exclu, le parcours passe du Comté à la Forêt. En confrontant les textes p. 7, 14 et 21, à 2J la 5e carte est nécessaire, une présence seule livre combat et une Force finale de 4 au round II ne donne pas de PV de conquête, contrairement à une Force de 5 pour le seul combattant non défaillant. Sur le papier, deux constructions dans la même Région donnent un seul Château redressé ; l'incliné donne déjà +2 de Force avec une unité, mais ne score pas. Ces cas sont des vérifications de lecture et de calcul, pas des tours joués.

### Reste à vérifier sur la boîte FR

Aucun accès direct au matériel FR : **aucune mise en place physique à 2, 3, 4 ou 5**, aucun comptage matériel, aucune confrontation au livret imprimé ni relecture indépendante du cas 2J et du premier joueur. Les essais n'ont pas vérifié le mélange ou les tirages réels, les séquences de jeu en conditions de partie, ni un moteur ou une interface de préparation. Aucun des sept ID n'est marqué `Validée`.

Pour terminer [#2](https://github.com/FlowHartigan/alice_wonder/issues/2), demander à une personne qui a la boîte `LKY WWR-R01-FR` de :

1. Noter le tirage (mentions boîte/livret), signaler tout encart ou amendement FR et comparer les p. 2–5 et 21 imprimées au PDF ; demander à Lucky Duck Games confirmation en cas d'écart.
2. Compter les pièces et cartes, dont les Alliés par niveau, les Folie doubles excédentaires et les Éclats par valeur (noir = 1, blanc = 5). Contrôler les correspondances Habitant/silhouette et Objet/paire de jetons. Relever les faces 2J des cinq plateaux (cases, récompenses de Forge et différences de pouvoirs/capacités).
3. Refaire et consigner les quatre mises en place ci-dessus : chaises, premier combat, quantités des pioches/réserves/sacs, pistes, Poisons et Éclats. À 2J, décompter les Quêtes retirées avec la Région révélée, vérifier le retrait des deux cartes du marché et de leur matériel ; faire relire l'ordre et les cas limites en §10. À tous les effectifs, faire relire la désignation de J1 et vérifier une distribution complète, dont J5 à zéro.
