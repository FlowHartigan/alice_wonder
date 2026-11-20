# rules.md — Spécification des règles de Wonderland's War

> **Statut : référentiel de travail, PAS une transcription intégrale ni une validation globale.**
>
> Ce document sera la source de vérité fonctionnelle du moteur de jeu **après validation de chaque règle**. Ne pas implémenter les règles non `Validées`.

Toute évolution de ce référentiel ou de son implémentation suit le [workflow GitHub d'`AGENTS.md`](AGENTS.md#workflow-github-obligatoire) : issue avant le travail, puis pull request et revue indépendante avant fusion. Relier les identifiants `WW-…` concernés à l'issue et à la PR.

## 0. Références, édition et méthode

- **Jeu :** Wonderland's War.
- **Édition de référence confirmée :** jeu de base Lucky Duck Games FR, `LKY WWR-R01-FR` ([#2](https://github.com/FlowHartigan/alice_wonder/issues/2)). Pour ce jalon, la conformité de la boîte au livret est une hypothèse de travail ; aucun tirage ni composant physique n'a été inspecté.
- **Nombre de joueurs :** 2 à 5, d'après la présentation de l'éditeur.
- **Structure générale :** trois rounds ; chaque round comprend une phase de Thé et une phase de Guerre, d'après la présentation de l'éditeur.
- **Périmètre :** les règles officielles à deux du jeu de base sont incluses. Extensions (dont *Folie Éclatante*), promos, modules optionnels et éditions distinctes sont hors périmètre.

Sources consultées le 19 novembre 2026 :
- [Fiche Lucky Duck Games FR](https://luckyduckgames.com/france/game/710-wonderland-s-war) : référence, langue, effectif et inventaire commercial ; la rubrique Téléchargement propose le [livret de base FR](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416), source des numéros de page ci-dessous. P. 2–3 : inventaire ; p. 4–5 : préparation ; p. 21 : exceptions 2J ; p. 22–23 : FAQ et clarifications intégrées, pas un erratum séparé.
- [Plateau central FR du dépôt](assets/official/plateau-principal-fr.webp) : dérivé du livret p. 2 ([provenance](LICENSES.md#plateau-central-fr)), utilisé pour compter les chaises et lire l'ordre géographique, pas une source matérielle indépendante.
- [Druid City Games](https://www.druidcitygames.com/wonderlands-war) : présentation du jeu original et renvoi vers [Allplay](https://www.allplay.com/board-games/wonderlands-war/). Allplay réserve ses *1st Edition Updated Faction Player Boards* au premier tirage de l'édition anglophone ; cela ne corrige pas le référentiel FR sans confirmation de Lucky Duck Games pour ce tirage. Ne pas appliquer ces plateaux EN ni les changements du retirage Deluxe EN.
- **Aucun erratum officiel applicable au setup FR n'a été trouvé dans ces sources.** Ce constat est limité aux sources consultées : pas de confirmation du SAV ni de comparaison avec un livret, encart ou plateau de la boîte FR. Un erratum officiel identifié comme applicable primerait sur le livret.

Pour [#2](https://github.com/FlowHartigan/alice_wonder/issues/2), `Validée` qualifie uniquement la règle ou le sous-périmètre confronté au livret FR (et, pour la désignation de J1, la décision produit séparément sourcée). Ce statut ne confirme ni le matériel physique, ni un catalogue de composants, ni une implémentation. Les réserves explicites restent non validées et ne doivent pas être implémentées comme des règles.

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

## 1. Inventaire et préparation de la partie

Les rubriques sont classées par identifiant. Pour préparer la partie, suivre cet ordre :

1. [Plateau et réserves communes](#ww-setup-004--plateau-et-réserves-communes) (p. 4, étapes 1–11) : à 2J, retirer une Région à l'étape 11 avant de déterminer le Premier combat (p. 21). Le retrait de deux cartes du marché est requis ; son insertion dans la séquence p. 4 reste non validée.
2. [Choisir les factions et prendre leurs lots](#ww-setup-002--choix-des-factions) (p. 5 A), puis [installer les ressources](#ww-setup-003--ressources-individuelles-et-quêtes) dans l'ordre imprimé : B–E (réserves, Forge, capacités et Force du Chef) → F (sac) → G (Bouclier) → H (Score) → I (Combat) → J (Quête) → K–M (Paris, aides, Chefs en Bout de Table).
3. [Désigner J1, fixer l'ordre des sièges et distribuer les Éclats](#ww-setup-005--initiative-et-éclats-du-round-i) (p. 5 N), puis commencer le Thé I.

Voir la [matrice de couverture et la recette documentaire 2–5J](docs/rules-coverage.md#recette-documentaire-de-la-mise-en-place).

### WW-SETUP-001 — Inventaire

**Statut : Validée pour l'inventaire de référence et ses quantités.** Sources : livret p. 2–3 (matériel), 8 et 22 (catégories), fiche Lucky Duck Games FR. Pour une partie de base à 2–5, partir des lots suivants, puis n'allouer que le matériel requis par l'effectif (§10).

| Lot de la boîte de référence | Quantités du livret FR |
|---|---|
| Plateaux, silhouettes et marqueurs | 1 plateau central, 5 plateaux Faction, 19 silhouettes avec bases (5 Chefs, 13 Habitants, 1 Premier combat), 6 marqueurs Score de Région, 2 marqueurs 4J/5J |
| Pièces de faction | 70 Partisans, 25 Châteaux, 30 disques, 5 cubes, 5 Boucliers, 5 pions Score 50+/100+, 5 sacs |
| Jetons pour les sacs | 95 Alliés hors Forge (19 de chacun : Flamant rose, Créature, Tour rouge, Rose, Carte soldat), 25 Forge, 34 Folie (29 simples, 5 doubles), 7 Poison, 20 Chef (4/faction), 30 Artefact (6/faction), 24 Objet (2 par type) |
| Éclats | 1 dé Éclat et 40 pièces Éclat de Folie (30 noires × 1 et 10 blanches × 5, soit 80 en valeur, distinctes des jetons Folie) |
| Cartes | 90 Thé (30 par round), 30 Quête, 20 Pari, 24 Pays des Merveilles (Habitants et Objets), 21 Allié (4 séries de 5 et 1 carte Forge) |
| Références | 10 cartes Référence des capacités d'Alliés, 5 cartes Référence des phases de jeu, 1 fiche Aide de jeu, 1 livret |

La fiche commerciale agrège « 254 pions » sans ventilation et classe les 24 cartes Pays des Merveilles sous « Habitants ». Pour préparer la partie, utiliser le détail p. 2–3 et la distinction Habitant/Objet p. 8 ; ne pas déduire d'un total commercial une pièce supplémentaire ou une correspondance carte–silhouette. **Non validés :** le catalogue par exemplaire (dont la ventilation faible/fort des Alliés) et les correspondances exactes carte–pièces.

**Contrôle :** pour chaque effectif, rapprocher les lots distribués, réservés et écartés de l'inventaire ; garder les Éclats, la Folie et le Poison dans trois catégories distinctes.

### WW-SETUP-002 — Choix des factions

**Statut : Validée pour le choix des factions, la face à utiliser et les dotations de l'étape A.** Sources : livret p. 2–3, 5 A, 8, 10–11, 21. Les textes et emplacements propres à chaque face ne sont pas validés ici.

- Chaque joueur choisit une faction distincte parmi Alice, Chapelier fou, Reine de cœur, Jabberwocky et Chat du Cheshire (un seul lot par faction). Le livret ne prescrit pas d'ordre de choix. Prendre la face ordinaire à 3–5 ou la face dorée « 2 JOUEURS » à 2, avant d'installer les pièces.
- Lot par joueur : 1 plateau, 1 silhouette Chef, 14 Partisans, 5 Châteaux, 1 sac, 4 jetons Chef (Force 1/1/1/2), 6 Artefacts (Force 3), 6 disques, 1 cube, 1 Bouclier, 1 pion Score 50+/100+ (à laisser de côté), les Folie et Forge de `WW-SETUP-003`, 2 cartes Référence Alliés, 1 carte Référence des phases et 4 cartes Pari à 3–5 (aucune à 2). Si le Jabberwocky est choisi, lui donner `effectif + 2` jetons Poison en réserve personnelle et ranger le reste ; sinon, aucun Poison en jeu. Ce décompte précède le pouvoir d'ouverture du Thé.
- Le pouvoir inné du Chef est distinct des quatre capacités initialement couvertes par des disques. Les pouvoirs décrits p. 10–11 pour les faces ordinaires s'appliquent au Thé : Alice se déplace en sens inverse, le Chapelier peut remplir les chaises vides et prendre une carte sans se déplacer une fois par Thé, la Reine peut répartir ses Partisans, le Chat peut céder un Éclat sur un résultat de 2 ou 3, le Jabberwocky peut empoisonner des cartes dès l'ouverture du Thé. Cela ne change ni l'ordre des sièges ni le contenu initial des sacs. À 2J, les pistes et certains pouvoirs/capacités imprimés changent : ne pas recopier les valeurs du côté ordinaire (voir `WW-COUNT-001` et `WW-FACTION-002`).

**Périmètre du salon web ([#5](https://github.com/FlowHartigan/alice_wonder/issues/5)) : règle validée et implémentée pour la liste et l'exclusivité uniquement.** Le [livret officiel FR `LKY WWR-R01-FR`](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416), p. 5 étape A, fait choisir une faction et prendre son matériel ; l'inventaire p. 2–3 présente un plateau, un Chef et un lot correspondant par faction. C'est ce matériel unique qui fonde l'exclusivité. Voir `WW-FACTION-001` pour les noms p. 10–11. Ni les faces, ni les dotations, ni le reste de la mise en place ne sont implémentés ici.

**Conventions du salon, non prescrites par le livret :** chaque siège choisit ou modifie sa faction lui-même. Une demande concurrente pour une faction déjà attribuée est refusée ; la disponibilité confirmée est partagée. Il faut une faction pour être prêt. Changer de faction libère l'ancienne et remet le siège à non prêt ; une sélection identique ou le rejeu d'un succès ne change rien.

**Lancement [#7](https://github.com/FlowHartigan/alice_wonder/issues/7) — Validée pour l'exclusivité à l'entrée en préparation.** Sources : livret FR `LKY WWR-R01-FR`, p. 5 A, lots p. 2–3 et noms p. 10–11. Le serveur exige une faction du catalogue différente pour chaque siège et fige ces choix à la transition. Le verrouillage est une convention du salon ; pas de placement, d'attribution de matériel ni de rangement à cette étape.

**Contrôle :** choisir deux factions distinctes dont le Jabberwocky ; vérifier les faces 2J, les silhouettes et les quatre emplacements couverts. Refaire à 5J avec les cinq factions, sans emprunt à une autre faction.

### WW-SETUP-003 — Ressources individuelles et Quêtes

**Statut : Validée pour les ressources et opérations établies de B à M.** Sources : livret p. 3, 5 B–M, 21. Aucun ordre entre joueurs n'est prescrit pour l'étape J ; la composition exacte des mains de Pari après K à 3–4J reste non validée.

1. **B–D — Réserves et Forge.** Poser les 14 Partisans et les 5 Châteaux en réserve personnelle. Transférer 4 Partisans sur les cases indiquées de la 3e piste de Forge (10 restent en réserve), puis poser 4 des 6 Artefacts sur les emplacements de récompense des pistes de Forge.
2. **E — Capacités et Force du Chef.** Couvrir les 4 capacités de Faction avec 4 disques et placer le cinquième sur Force du Chef **1**.
3. **F — Sac.** Y mettre les 4 jetons Chef (1/1/1/2), les 2 Artefacts de Force 3 restants, 1 Forge de Force 1 (2 à 2J), 2 Folie simples et 1 double, soit **10 jetons** (11 à 2J). Aucun autre Allié, Poison, Objet ou Éclat dans le sac au départ. Les zones Actifs et Épuisés et la piste de Folie restent vides.
4. **G — Bouclier.** Le poser côté intact en haut à gauche du plateau Faction.
5. **H — Score.** Placer le dernier disque sur Score **0**.
6. **I — Combat.** Placer le cube de Faction sur Combat **0**.
7. **J — Quête.** Chaque joueur pioche 2 Quêtes, en garde 1 face cachée dans son journal et remet l'autre dans le paquet Quête avant de le remélanger. À 2J, la pioche a déjà été filtrée à l'étape 11 (p. 4 et 21). Les pièces posées et les Éclats distribués en N sont visibles, pas la Quête conservée par un autre joueur.
8. **K — Paris.** Ranger les cartes Pari des factions inutilisées ; à 2J, toutes restent hors jeu. Ne pas confondre les quatre cartes prises à l'étape A avec les cibles de Pari utilisables après K : à 3–4J, le texte ne distingue pas explicitement les lots des factions absentes des cartes qui les représentent dans les lots distribués. Un Pari ne vise qu'une faction qui combat (p. 12).
9. **L — Aides.** Poser face visible la carte Référence Alliés de la série en jeu, ranger l'autre et poser la carte Référence des phases à côté.
10. **M — Chefs.** Placer les silhouettes Chef en Bout de Table, pas dans les Régions. Passer ensuite à l'étape N (`WW-SETUP-005`).

**Contrôle :** suivre l'ordre F–M de la p. 5 avant de passer à N. Décompter les sacs, pistes et réserves pour les quatre effectifs, avec puis sans Jabberwocky quand c'est possible. Suivre une Quête refusée jusque dans la pioche et vérifier que seul le propriétaire voit celle qu'il garde.

### WW-SETUP-004 — Plateau et réserves communes

**Statut : Validée pour les étapes communes numérotées, la disposition de départ et l'exception régionale 2J.** Sources : livret p. 2–4, 5 I et M, 8–9, 21 ; plateau FR numérique pour les emplacements. **Non validé :** le moment exact du retrait des cartes Pays des Merveilles à 2J par rapport aux étapes 4–5.

Les numéros en gras renvoient aux étapes imprimées p. 4 ; les étapes consécutives sont regroupées sans en changer l'ordre.

- **1–2.** Installer le plateau ; mélanger les 6 [marqueurs Score](#ww-map-004--marqueurs-score-de-région) et en poser 1 au hasard par Région. Ranger le 6e. Le circuit horaire lu sur le plateau part du Donjon rouge, puis Forêt de Tulgey → Jardin des Fleurs vivantes → Mare de Larmes → Comté de la Déraison → Donjon rouge.
- **3.** Choisir un paquet d'Alliés A, B, C ou D (A conseillé, pas imposé, pour la première partie). Aligner ses 5 cartes et la carte Forge avec les jetons correspondants, en distinguant les niveaux faible et fort ; Forge n'a que le niveau faible. Ranger les 15 autres cartes Allié. Cette recette porte sur un paquet complet, pas sur le mélange de séries évoqué p. 9.
- **4–5.** Mélanger les cartes Pays des Merveilles et en révéler 3 ; garder la pioche face cachée. Sur une carte Habitant, poser sa silhouette ; sur une carte Objet, poser ses deux jetons. Le texte de l'étape 5 parle des « jetons de l'Habitant », mais son illustration et la distinction p. 8 les rattachent à l'Objet. Mettre de côté le matériel non exposé. À 2J, respecter les exclusions de §10 ; le moment du filtrage reste ouvert.
- **6–9.** Poser au centre du Thé la réserve de Folie, les Éclats et le dé. Bloquer les chaises selon §10 ; séparer et mélanger les trois paquets Thé, garnir d'une carte Thé I face visible chaque chaise non bloquée. Laisser le reste du paquet I près du Bout de Table et réserver II et III pour plus tard. Le Bout de Table et l'emplacement du paquet ne sont pas des chaises à garnir.
- **10.** Mélanger les Quêtes et poser la pioche face cachée.
- **11.** À 3–5J, poser Premier combat au Donjon rouge, puis lancer le dé Éclat et avancer d'autant de Régions en sens horaire. À 2J, retirer la Région tirée, ses Quêtes et son marqueur Score, puis placer et déplacer Premier combat selon `WW-COUNT-001`. Ce lancer ne distribue pas d'Éclats. Préparer ensuite les factions ; avant le premier Thé, toutes les Régions sont sans unité ni Château.

**Périmètre web des chaises ([#54](https://github.com/FlowHartigan/alice_wonder/issues/54)) : étape 7.** Livret FR `LKY WWR-R01-FR`, p. 4 étape 7 et p. 21 ; voir `WW-COUNT-001/002`. Sur 13 chaises, 2 ou 3 sièges admis laissent 11 chaises ouvertes (4J et 5J bloquées), 4 sièges en laissent 12 (5J bloquée), 5 sièges en laissent 13 (aucune bloquée). Ni le Bout de Table ni l'emplacement de la pioche ne comptent. L'effectif est figé au lancement, indépendamment des connexions. Une chaise ouverte n'a pas encore de carte. L'aperçu montre aussi l'affectation initiale de l'étape 2 ([#59](https://github.com/FlowHartigan/alice_wonder/issues/59), `WW-MAP-004`), sans exécuter de tirage côté client.

**Périmètre web 2J ([#65](https://github.com/FlowHartigan/alice_wonder/issues/65)) : étapes 10–11, pour le seul retrait régional.** Après l'affectation initiale des marqueurs (étape 2), le serveur mélange le paquet web v1 et applique le [contrat moteur 2J](#retrait-régional-initial-au-moteur-2j) (#61). À 3–5J, ce mélange n'est pas activé. Le lancer de Premier combat est une étape distincte qui suit le retrait à 2J.

**Repérage visuel :** sur le [plateau FR du dépôt](assets/official/plateau-principal-fr.webp) dérivé du livret p. 2, les pictogrammes imprimés 4 et 5 sont côte à côte sur le bord supérieur de la table du Thé. Les centres des badges 4J et 5J sont respectivement à environ 55,4 % et 63,1 % de la largeur depuis la gauche, tous deux à 24,1 % de la hauteur depuis le haut du WebP entier. Ce sont des coordonnées de présentation, pas des données du moteur.

**Contrôle :** avec un marché d'essai mêlant Habitant et Objet, obtenir 3 cartes correctement équipées. À 4J avec un résultat de dé 2, conserver le bloqueur sur 5J et placer Premier combat au Jardin des Fleurs vivantes, sans ajouter d'Éclats aux joueurs.

#### Région de Premier combat au moteur

**Parcours validé ([#67](https://github.com/FlowHartigan/alice_wonder/issues/67)).** Livret FR `LKY WWR-R01-FR`, p. 4 étape 11 et p. 21 étape 4 (`WW-COUNT-001`) ; circuit du catalogue [`WW-MAP-001`](#ww-map-001--catalogue-des-régions). `resolveFirstBattleRegion` prend des données internes : `playerCount` (2, 3, 4 ou 5), `dieResult` (nombre de pas déjà fourni, entier fini et non négatif) et `excludedRegionId` (ID connu de la Région déjà retirée, requis à 2J et interdit à 3–5J). Une entrée incohérente est refusée par `TypeError`.

Le calcul renvoie uniquement l'ID final. `getActiveRegionCircuit` donne le départ : Donjon rouge à 3–5J, Région suivante en sens horaire après celle retirée à 2J. Seules les transitions comptent : zéro laisse au départ ; après la dernière Région active, reprendre à la première sans compter la Région exclue. Ainsi, à 3–5J, deux pas donnent le Jardin des Fleurs vivantes ; à 2J, Donjon exclu, deux pas depuis la Forêt de Tulgey donnent la Mare de Larmes. Voir les [tests moteur](docs/rules-coverage.md#tests-du-calcul-de-premier-combat).

Le calcul est pur : aucun hasard, nouveau retrait, changement d'état ou d'adjacence. Au lancement de la préparation ([#69](https://github.com/FlowHartigan/alice_wonder/issues/69)), le serveur utilise l'effectif figé et lance le dé une seule fois après l'affectation des marqueurs et, à 2J, après le tirage de Quête et le retrait. Il sauvegarde le résultat et la version du dé, puis dérive la Région finale du résultat et du setup figé, sans nouveau lancer à la reprise. Les sièges admis voient le marqueur et le résultat en texte ; aucun résultat ni choix de Région n'est accepté d'un client. Pas de crédit ni de prélèvement d'Éclats, de PV, de début du Thé ou de la Guerre, d'ouverture de combat (#20) ou de réutilisation aux rounds suivants.

**Arbitrage web v1 approuvé par le propriétaire ([#69](https://github.com/FlowHartigan/alice_wonder/issues/69)).** Le dé de ce placement a six faces équiprobables **1, 1, 1, 2, 2, 3** : P(1) = 1/2, P(2) = 1/3, P(3) = 1/6. Ce relevé provient de la même texture TTS EN partagée par les modules [2886627193](https://steamcommunity.com/sharedfiles/filedetails/?id=2886627193) et [2065591102](https://steamcommunity.com/sharedfiles/filedetails/?id=2065591102) : une seule observation, aucune texture importée. La p. 11 FR mentionne 2 et 3 pour le Chat du Cheshire sans établir la répartition. Cet arbitrage n'est ni une confirmation du matériel FR ni un erratum officiel ; les faces FR restent à vérifier.

### WW-SETUP-005 — Initiative et Éclats du round I

**Statut : Validée pour le round I : critère de J1, désignation par l'hôte, ordre des sièges et Éclats.** Sources : livret p. 3, 5 N et tableau « À vos marques, prêts… par-thé ! », p. 6 et 11 ; [décision produit](docs/decisions.md#décisions).

Une fois la table et les factions prêtes, la personne qui a bu du thé le plus récemment commence. **Décision produit :** l'hôte désigne cette personne selon l'accord des joueurs ; l'hôte n'est pas automatiquement J1. À partir de J1, les sièges suivants en sens horaire donnent J2, J3, etc. (ordre des joueurs, indépendant du sens de déplacement d'Alice ou du marqueur Premier combat). Le choix de J1, l'ordre et les Éclats placés à côté des plateaux sont publics. Si la table ne s'accorde pas, aucun départage automatique n'est établi. L'initiative des rounds II et III relève de `WW-FLOW-003` (p. 6) : moins de PV, puis moins d'unités dans les Régions, puis plus d'Éclats ; la p. 6 ne tranche pas l'égalité persistante. Pas de nouvelle distribution d'Éclats de départ.

**Périmètre du salon web ([#6](https://github.com/FlowHartigan/alice_wonder/issues/6)) : Validée et implémentée pour la désignation de J1 uniquement.** Le [livret de base FR `LKY WWR-R01-FR`](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416), p. 5 étape N, fixe le critère du thé ; la [décision produit](docs/decisions.md#décisions) confie la saisie à l'hôte après accord de la table. Dans le salon avant lancement, l'hôte peut désigner ou remplacer J1 parmi les sièges du salon, dont le sien. Le choix est public, persistant et initialement absent. Si le siège référencé n'existe plus, le choix est effacé, sans remplacement. Une déconnexion ne retire pas le siège. Ces modalités de saisie et de persistance sont des conventions de l'application, pas une règle de départage. La référence de siège servira d'entrée à la préparation ; aucun lancement, calcul de l'ordre des tours, ni distribution d'Éclats n'est exécuté par cette action. Aucun départage n'est ajouté en l'absence d'accord.

**Lancement [#7](https://github.com/FlowHartigan/alice_wonder/issues/7) — Validée pour J1 en entrée de préparation.** Source : livret FR `LKY WWR-R01-FR`, p. 5 N (critère du thé), et décision produit pour la saisie par l'hôte. Le lancement exige un choix explicite parmi les sièges encore admis, le fige et le montre aux joueurs admis. Aucun départage automatique ni début du Thé.

**Aperçu web [#63](https://github.com/FlowHartigan/alice_wonder/issues/63) — en préparation seulement.** Le moteur lit la liste figée `GameState.playerIds` comme un circuit horaire et la parcourt depuis le J1 désigné, quitte à revenir au début. Il associe à chaque rang la valeur ci-dessous ; ni les factions ni les connexions ne changent le résultat. Le serveur montre le même aperçu aux seuls sièges admis, sans tirage ni sauvegarde supplémentaire. Cet affichage n'exécute pas N : aucun Éclat crédité ni prélevé, aucun joueur actif ni ouverture du Thé. L'étape N reste après M, une fois la table et les factions prêtes ([#12](https://github.com/FlowHartigan/alice_wonder/issues/12), [#13](https://github.com/FlowHartigan/alice_wonder/issues/13)).

Tableau relevé **visuellement** en bas à droite de la p. 5 du PDF FR : chaque pictogramme noir représente un Éclat de valeur 1 (p. 3). Case vide pour un siège présent = **0** ; `—` = siège absent.

| Effectif | J1 | J2 | J3 | J4 | J5 | Total distribué |
|---|---:|---:|---:|---:|---:|---:|
| 2 | 2 | 1 | — | — | — | 3 |
| 3 | 3 | 2 | 1 | — | — | 6 |
| 4 | 3 | 2 | 2 | 1 | — | 8 |
| 5 | 3 | 2 | 2 | 1 | 0 | 8 |

**Contrôle :** pour chaque effectif, désigner un joueur non hôte et tourner autour des sièges depuis lui ; vérifier la ligne, le total prélevé et, à 5J, un J5 présent sans Éclat. Prendre Alice comme J1 dans un cas : son trajet antihoraire ne change pas le siège de J2.

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

**WW-WAR-004** — Arrêt des pioches, validation limitée aux cas 2J ci-dessous. La règle générale (p. 12–13 et 24 FR) met fin au combat si tous ont échoué ou abandonné, si le seul joueur encore en lice est seul en tête, ou si au moins un atteint 25 (égalité si plusieurs au cours de la même pioche). À 2J, voir le [critère spécial et sa validation](#ww-war-004--arrêt-des-pioches-à-2j), distincts des récompenses.

**WW-WAR-005** — À vérifier, p. 10, 13 et 22–24. Folie : placer sur la piste et perdre une unité par icône, Chef retiré en dernier. Le Bouclier intact peut annuler le jeton et le renvoyer au sac, en se brisant. L'échec faute d'unités annule la Force, épuise les Actifs, exclut le joueur du combat et répare le Bouclier. Le Poison fait perdre une unité puis retourne au Jabberwocky (ou au sac si contré), sans avancer la piste de Folie.

**WW-WAR-006** — À vérifier, p. 13 et 22–23. Ordre si nécessaire : Folie et échec, effets sur soi et ses jetons, puis effets sur des adversaires. Si un ordre entre joueurs est requis : moins de PV, puis plus d'Éclats. Vérifier égalité persistante et interactions texte par texte.

**WW-WAR-007** — À vérifier, p. 14–15 et 21. Rang selon la Force, hors échecs ; le premier gagne les PV régionaux du round et construit s'il n'a pas déjà de Château. Le deuxième gagne la moitié des PV. Égalité au premier rang : chaque ex æquo choisit PV ou construction, sans deuxième prix ; égalité au deuxième : partage arrondi au supérieur. À 3–5, présence unique : choisir PV ou construction, sans pioche ni Pari. Tester le cas d'un Château déjà présent lors d'un choix et les exceptions de `WW-COUNT-001`.

**WW-WAR-008** — À vérifier, p. 14–15. Ordre indiqué : conquête/Château, Quêtes, capacités de fin, Forge, Paris, conclusion. Épuiser les Actifs restants, remettre les repères de Force au départ, laisser la Folie sur sa piste, continuer vers la Région suivante.

**WW-WAR-009** — À vérifier, p. 12, 14–15 et 21. À 3–5, après détermination de la Force de départ d'un combat disputé, les non-participants peuvent miser simultanément et en secret sur le vainqueur. Réussite : un Allié faible choisi ; erreur : un Éclat ; égalité en tête : ni gain ni pénalité. Vérifier la résolution des paris si tous les combattants échouent.

### WW-WAR-004 — Arrêt des pioches à 2J

**Statut : Validée pour le projet, dans les seuls cas 2J ci-dessous.** [#44](https://github.com/FlowHartigan/alice_wonder/issues/44) a établi la chronologie de la première pioche et le cas sous le seuil sur le [livret FR `LKY WWR-R01-FR`](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416). [#47](https://github.com/FlowHartigan/alice_wonder/issues/47) consigne l'arbitrage du propriétaire pour l'égalité et la priorité du seuil après abandon, selon la lecture littérale de la p. 21 FR. Cet arbitrage n'est ni un erratum ni une confirmation de l'éditeur.

**Chronologie — validée sur livret FR.** À 2J, même si une seule faction a des unités dans la Région, elle livre bataille contre la Résistance locale (p. 21). Fixer la Force de départ, puis effectuer et résoudre intégralement la première pioche. L'étape de vérification de fin suit la résolution (p. 12 et organigramme « Faire la Guerre », p. 24) : une Force de départ de **5 ou plus au round II** ne déclenche donc pas d'arrêt par la Résistance avant cette pioche. Le choix d'abandonner n'est possible qu'à une « Nouvelle pioche ? », si le combat se poursuit (p. 13 et FAQ « Abandonner un combat », p. 22). L'abandon est irréversible et la Force acquise compte encore ; ce n'est pas un échec, qui ramène la Force à 0 (p. 13).

**Sous le seuil, seule Résistance — validé sur livret FR.** Si le seul combattant reste en lice à **4 après la première pioche** au round II (par exemple Force de départ 3 et jeton résolu à +1), il **peut continuer à piocher** : il n'est pas arrêté du seul fait d'être seul, puisqu'il est encore derrière la Résistance à 5 (exception 2J, p. 21). Ce scénario ne suppose aucun autre combattant humain ayant abandonné.

**Critère spécial d'arrêt — arbitrage FR du projet.** Une fois la première pioche entièrement résolue, dès qu'un seul combattant humain est encore en lice et que sa Force atteint ou dépasse la Résistance locale (**3 / 5 / 7** aux rounds I / II / III), le combat s'arrête sans nouvelle pioche. Ce critère spécial suffit, même si le combattant encore en lice n'est pas seul en tête du classement.

- **À égalité :** au round II, le seul combattant, sans adversaire humain, a **5** après résolution complète de la première pioche. Il atteint la Résistance à 5 : le combat s'arrête.
- **Après abandon :** au round II, A est seul en lice à **6**, B a abandonné à **8** et la Résistance est à **5**. A s'arrête malgré la Force supérieure de B. B ne repioche pas et conserve sa Force de 8 pour le classement ; l'abandon ne vaut pas échec.

*Note historique ([#44](https://github.com/FlowHartigan/alice_wonder/issues/44)) : le [livret EN v1.20, p. 21](https://pakufuda.store/wp-content/uploads/2025/05/SKB-WW-rulebook-1.20.pdf#page=21) et la [réponse de Tim Eisner](https://boardgamegeek.com/thread/2814244/article/39474262#39474262) permettent de repiocher à égalité avec la Résistance. Cette lecture EN n'est pas normative pour le FR ; aucun erratum FR applicable à ces deux cas n'a été identifié dans la vérification de #44.*

**Récompenses après la fin du combat — rappel uniquement.** Selon la p. 21 FR et [`WW-COUNT-001`](#ww-count-001--exceptions-à-deux-joueurs), une Force **finale** de 4 au round II ne donne pas de récompense de conquête ; une Force finale de 5 remplit le seuil d'éligibilité. Ce contrôle d'éligibilité ne détermine ni le droit de repiocher, ni le moment de l'arrêt, ni le rang (`WW-WAR-007`). Le barème reste inchangé.

**Implémentation et tests — [#49](https://github.com/FlowHartigan/alice_wonder/issues/49), critère spécial uniquement.** La fonction pure `triggersTwoPlayerDrawStop`, exportée par `@wonderland/game-engine`, lit l'effectif total de la partie, le round, le signal explicite de résolution complète de la première pioche et les statuts et Forces des combattants humains (sans la Résistance). Elle signale ce motif d'arrêt sans modifier l'instantané. `false` signifie seulement que ce motif ne s'applique pas ; ce n'est pas une autorisation de repiocher.

Voir la [recette documentaire](docs/rules-coverage.md#recette-documentaire-de-larrêt-des-pioches-à-2j) et la [couverture des tests unitaires](docs/rules-coverage.md#tests-unitaires-du-critère-spécial-à-2j). Le cycle de combat reste à intégrer, synchroniser et tester dans [#22](https://github.com/FlowHartigan/alice_wonder/issues/22), notamment la production du signal de résolution complète. `WW-WAR-003`, les autres motifs d'arrêt, le classement et les récompenses ne sont pas implémentés ni validés par cet incrément.

## 5. Sac et jetons — À vérifier

**WW-BAG-001** — À vérifier, p. 2–5 et 22. Cinq familles : Alliés (Forge comprise), Faction (Chef et Artefact), Objet, Folie et Poison. Inventorier forces, exemplaires et visuels du tirage avant de créer le catalogue.

**WW-BAG-002** — À vérifier, p. 8, 13, 15 et 22. Un jeton gagné va par défaut au sac. La fin du combat déplace les Actifs vers les Épuisés sauf effet contraire ; un jeton forgé va sur une piste Forge, tandis qu'un jeton définitivement défaussé retourne à la réserve commune. Tester la conservation de chaque instance dans une seule zone.

**WW-BAG-003** : conditions et méthode de reconstitution / remise à zéro du sac.

**WW-BAG-004** : visibilité des informations : quantités connues et ordre caché.

**WW-BAG-005** — À vérifier, p. 9–10, 13 et 22–23. Les jeux d'Alliés A à D attribuent des effets différents aux mêmes familles de jetons ; la force modifiée d'un jeton ne se conserve pas pour une future pioche. Dresser le catalogue des effets et dépendances, y compris Folie et Poison (`WW-WAR-005`).

## 6. Régions, unités et châteaux — Validation partielle

### WW-MAP-001 — Catalogue des Régions

**Statut : Validée pour les noms, les adjacences du plateau complet et le circuit horaire ([#57](https://github.com/FlowHartigan/alice_wonder/issues/57)).** Sources : [livret Lucky Duck Games FR `LKY WWR-R01-FR`](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416) et [plateau FR du dépôt](assets/official/plateau-principal-fr.webp), dérivé de la p. 2. La p. 7 (« S'aventurer dans le Pays des Merveilles ») confirme les cinq Régions périphériques. Le glossaire p. 22 (« Adjacence », repris p. 24) confirme le voisinage des Régions côte à côte et l'arête Mare–Comté, malgré l'espace de la piste de Combat entre elles. Aucune inspection du plateau physique ni validation de coordonnées graphiques.

| Position horaire (depuis le Donjon) | Région | ID stable | Voisines sur le plateau complet |
|---|---|---|---|
| 1 | Donjon rouge | `donjon-rouge` | Comté, Forêt |
| 2 | Forêt de Tulgey | `foret-de-tulgey` | Donjon, Jardin |
| 3 | Jardin des Fleurs vivantes | `jardin-des-fleurs-vivantes` | Forêt, Mare |
| 4 | Mare de Larmes | `mare-de-larmes` | Jardin, Comté |
| 5 | Comté de la Déraison | `comte-de-la-deraison` | Mare, Donjon |

Le graphe est non orienté ; le circuit est orienté et revient du Comté au Donjon. La p. 4 étape 11 situe le départ de Premier combat au Donjon pour 3–5J ; la p. 12 (« Combats ») confirme le sens horaire du parcours des Régions. Les ID sont des conventions du catalogue logiciel v1, indépendantes de l'illustration.

**WW-SETUP-004 / WW-COUNT-001 — Validée pour l'exclusion régionale et son parcours à 2J.** La p. 4 étape 11 renvoie à la p. 21, « Mise en place », étapes 1–4. À partir de l'ID de la Région déjà désignée par la Quête, le circuit actif commence à la Région suivante, avant le lancer, et saute la Région exclue. Exclure le Donjon donne Forêt → Jardin → Mare → Comté → Forêt ; deux pas depuis la Forêt donnent la Mare. La Région écartée est absente du parcours et n'a aucun voisin actif ; le graphe actif ne conserve que les arêtes entre Régions encore en jeu, sans ajouter Comté–Forêt. C'est un filtrage des données, pas une interprétation de l'« ordre du combat » pour la Carte soldat B (p. 23), dont l'effet n'est pas implémenté ici. Le catalogue complet reste inchangé. Ce filtrage n'exécute aucun tirage de Quête ni de dé, aucun placement, combat ou score. L'affectation des marqueurs est traitée séparément par `WW-MAP-004`. Voir les [tests du catalogue](docs/rules-coverage.md#vérification-du-catalogue-des-régions).

**WW-MAP-002** — À vérifier, p. 7–8, 12–13, 21–22. Les Partisans, Habitants et Chefs sont des unités ; les Châteaux n'en sont pas. Les placements liés au Thé et les retraits liés au combat sont décrits par `WW-TEA-004` et `WW-WAR-005`. Les unités perdues ne restent pas dans la Région ; vérifier la destination et l'éligibilité des Chefs aux effets spécifiques.

**WW-MAP-003** — À vérifier, p. 8, 12, 14–15 et 21. Maximum un Château par faction et par Région ; construction par effet ou conquête. Il donne 2 de Force de départ à son propriétaire participant et des PV en fin de partie, dépendants de la piste de Forge. À deux, construction en deux étapes et valeur finale des seuls Châteaux redressés.

### WW-MAP-004 — Marqueurs Score de Région

**Statut : Validée pour le projet, pour les six barèmes et leur affectation ([#8](https://github.com/FlowHartigan/alice_wonder/issues/8)).** Sources : [livret FR `LKY WWR-R01-FR`](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416), p. 2 (six pièces), p. 4 étape 2 (mélange, affectation et rangement), p. 14 (« Conquête de Région et Château », lecture de gauche à droite : PV des rounds I, II et III) et p. 21 étape 3 (retrait à 2J).

**Barèmes I / II / III.** La [décision du propriétaire](https://github.com/FlowHartigan/alice_wonder/issues/8#issuecomment-7023483674) retient **2 / 6 / 10** (p. 2) et **2 / 6 / 12**, **2 / 8 / 10**, **4 / 6 / 10**, **4 / 8 / 8**, **6 / 6 / 8** (p. 4). Elle écarte **4 / 4 / 12**, observé dans l'illustration du Thé p. 6. Le [relevé historique](docs/rules-coverage.md#vérification-du-catalogue-des-régions) reste valable comme observation des visuels ; le choix web n'est ni un erratum, ni une confirmation de l'éditeur, ni une vérification du matériel physique.

**Affectation (`WW-SETUP-004`, étapes 2 et 11).** Mélanger les six marqueurs, en affecter un à chacune des cinq Régions et ranger le sixième. Les identifiants des marqueurs sont distincts des IDs de Région ; aucun barème n'est attribué à une Région de façon fixe. À 2J, si la Région exclue est déjà désignée, retirer le marqueur qui lui a été affecté, sans déplacer les quatre autres ni modifier le sixième rangé (p. 21 étape 3). Sans ID de Région désignée, l'opération s'arrête à l'affectation sur le plateau complet.

**Implémentation et tests.** `REGION_SCORE_MARKER_CATALOG` (v1, `@wonderland/shared`) et `assignRegionScoreMarkers` (`@wonderland/game-engine`, source aléatoire injectée) sont couverts par les [tests unitaires](docs/rules-coverage.md#tests-unitaires-des-marqueurs-score-de-région). Le résultat distingue le marqueur rangé du placement écarté à 2J si l'ID exclu est fourni au moteur.

**Intégration web [#59](https://github.com/FlowHartigan/alice_wonder/issues/59) — Affectation initiale.** Après validation du lancement à 2–5J, le serveur mélange une fois les six pièces, sauvegarde l'affectation complète et n'affiche aux sièges admis que les placements actifs et leurs PV I/II/III (livret FR p. 2, p. 4 étape 2 et p. 14). Sur le [WebP FR](assets/official/plateau-principal-fr.webp), les badges centrés sur les groupes de trois ronds près des noms imprimés ont pour coordonnées x/y (en % du WebP entier depuis le haut gauche) : Donjon rouge 87,4/67,1 ; Forêt de Tulgey 56,9/89,2 ; Jardin des Fleurs vivantes 11,2/63,2 ; Mare de Larmes 11,3/51,6 ; Comté de la Déraison 88,6/55,8. Ces positions n'affectent pas les règles. Voir la [recette](docs/rules-coverage.md#recette-des-placements-au-lancement).

À 2J, le [retrait du marqueur déjà posé](#retrait-régional-initial-au-moteur-2j) est appliqué au lancement (p. 21 étape 3), sans remélanger ni réaffecter. L'aperçu indique la Région hors jeu et affiche les quatre autres placements. À 3–5J, les cinq placements restent visibles. Aucun PV n'est attribué (`WW-WAR-007`) et le Thé ne démarre pas.

## 7. Factions et asymétrie — Validation partielle

### WW-FACTION-001 — Liste des factions

**Statut : Validée pour les cinq noms uniquement.** [Livret officiel du jeu de base `LKY WWR-R01-FR`](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416), rubrique « Pouvoirs des Chefs » : **Jabberwocky** et **Chapelier fou** (p. 10), **Reine de cœur**, **Alice** et **Chat du Cheshire** (p. 11). Le salon reprend ces noms ; l'exclusivité est couverte par `WW-SETUP-002`. Les pouvoirs, capacités, pistes et différences des faces 2J ne sont pas validés par ce contrôle ; la boîte physique n'a pas été vérifiée (voir §0 et §12).

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

## 10. Règles spécifiques selon le nombre de joueurs

### WW-COUNT-001 — Exceptions à deux joueurs

**Statut : Validée pour la préparation 2J établie ci-dessous (livret p. 4–5 et 21), hors ordre du filtrage du marché et données individuelles non établies.** Les règles de jeu résumées ensuite sont `Documentées`, hors validation de ce jalon de préparation ; voir [`WW-WAR-004`](#ww-war-004--arrêt-des-pioches-à-2j) pour la validation distincte des cas d'arrêt des pioches à 2J.

**Lancement [#7](https://github.com/FlowHartigan/alice_wonder/issues/7) — Validée pour l'admission d'un effectif de deux joueurs.** Livret FR `LKY WWR-R01-FR`, p. 4 étape 11 et p. 21, « Règles des parties à 2 joueurs ». À deux, la transition fige ces deux sièges, applique le retrait régional (#65), puis détermine Premier combat (#69, [arbitrage web du dé](#région-de-premier-combat-au-moteur)). Les chaises bloquées relèvent de #54. Les autres exceptions matérielles ou de jeu (faces des plateaux, réserves, Résistance, Thé à deux, etc.) ne sont pas exécutées. L'ordre du filtrage du marché reste ouvert.

- **Marché :** retirer l'**Amulette de la Duchesse** et le **Lièvre de Mars** du paquet Pays des Merveilles (p. 21). Le marché initial doit donc compter trois cartes autorisées, avec le matériel correspondant ; ne pas y installer la paire de jetons Objet de l'Amulette ni la silhouette du Lièvre. Retirer les deux cartes **avant** mélange et révélation est une proposition de déroulé, **non validée** : p. 21 ne situe pas le retrait par rapport aux étapes 4–5, et ne précise ni comment traiter une carte exclue déjà révélée ni où ranger son matériel.
- **Région :** au renvoi de la p. 4 étape 11, révéler 1 Quête au hasard : sa Région d'Exploit devient inutilisée. Retirer toutes les Quêtes de cette Région, y compris celle révélée, et son marqueur Score posé au hasard ; ne pas y placer d'unité ni de Château et ne pas y combattre. Placer Premier combat dans la Région suivante en sens horaire **avant** le lancer, puis avancer du résultat du dé sans compter la Région retirée. La Quête utilisée pour le tirage de Région est révélée publiquement, pas les Quêtes initiales conservées.
- **Plateaux et ressources :** bloquer les deux chaises 4J/5J ; prendre la face au cadre doré « 2 JOUEURS » en bas à gauche. Ajouter un jeton Forge dans chaque sac, ne distribuer aucune carte Pari, donner 4 Poison si le Jabberwocky joue et appliquer la ligne d'Éclats 2/1. Réserver le cube d'une faction non jouée pour la Résistance locale ; les deux cubes des joueurs vont sur Combat 0. Le cube réservé est posé sur **3 / 5 / 7** au début de la Guerre du round I / II / III, pas au départ du Thé I (p. 21).

**Contrôle de préparation :** avec le Donjon rouge révélé et un dé de 2, partir de la Forêt de Tulgey et finir à la Mare de Larmes ; après le Comté, le circuit reprend à la Forêt. Vérifier le résultat des exclusions au marché et dans les Quêtes, les faces 2J, le cube distinct, les 11 jetons par sac et l'absence de cartes Pari. Le relevé des cinq faces et le nombre de Quêtes à retirer par Région nécessitent un catalogue FR ; l'adjacence pour les effets hors circuit des combats n'est pas déduite du saut de Région.

#### Retrait régional initial au moteur (2J)

**Règle validée, données FR encore à vérifier.** Livret de base FR `LKY WWR-R01-FR` p. 2–3 (30 Quêtes), p. 4 étapes 10–11 (`WW-SETUP-004`) et p. 21 étapes 1–3 (`WW-COUNT-001`, `WW-MAP-004`). `resolveTwoPlayerRegionSetup` prend deux données internes, jamais une charge utile client :

- `shuffledQuestDeck` : les 30 Quêtes de base complètes, déjà mélangées, dessus à l'index 0. Chaque carte porte un ID textuel non blanc, unique par égalité exacte, et un `exploitRegionId` du catalogue existant. Aucune région n'est déduite d'un ID de Quête et aucune ventilation n'est imposée.
- `initialRegionScores` : l'inventaire strict de #59, avec un placement par Région et les six IDs de marqueurs distincts du catalogue, dont cinq posés et un rangé. Un inventaire déjà filtré est invalide.

Une entrée hors contrat est refusée par `TypeError`. L'appelant garantit la phase de préparation, l'effectif de deux joueurs ainsi que la provenance et le mélange de la pioche. Le moteur ne vérifie pas la composition éditoriale du paquet.

Le résultat interne désigne la Quête du dessus et sa Région, puis répartit les cartes entre le lot écarté et la pioche restante, sans mutation, remélange ni hasard. Les deux lots conservent l'ordre relatif et les références des cartes ; la Quête révélée désigne une carte du lot écarté, pas une carte supplémentaire. Les quatre placements Score conservés restent dans leur ordre initial, le placement retiré est isolé, le sixième reste rangé. `getActiveRegionCircuit` et `getActiveRegionNeighbors` reçoivent la Région écartée : le circuit démarre à la Région suivante, le graphe ne gagne aucune arête. Aucun placement de Premier combat ni lancer de dé n'est exécuté.

**Activation web [#65](https://github.com/FlowHartigan/alice_wonder/issues/65).** Après validation complète du lancement à 2J, le serveur mélange les 30 Quêtes du paquet web v1, une localisation non officielle d'un relevé TTS EN approuvée pour ce seul retrait. L'ordre sauvegardé fixe le résultat ; seuls le titre FR de la Quête du dessus, la Région exclue et les quatre placements actifs sont visibles des deux sièges admis. Aucun tirage dans un salon ouvert, à 3–5J ou à la reprise. La [vérification du paquet physique FR et des critères](docs/rules-coverage.md#paquet-web-v1-et-vérification-fr) reste ouverte en #10 ; la mise en place complète reste à intégrer en [#12](https://github.com/FlowHartigan/alice_wonder/issues/12). Pas de distribution de Quête (#14). Voir les [tests du retrait 2J](docs/rules-coverage.md#tests-du-retrait-régional-initial-à-2j).

#### Règles de jeu 2J — hors recette de préparation

Sources : livret p. 7, 12–15, 21 et clarification Carte soldat D p. 23.

- **Thé et Guerre :** chaque joueur doit gagner **5** cartes Thé, au lieu de 4, avant de placer son Chef. Aucun pari ni conquête automatique si une seule faction est présente : elle combat aussi. La Résistance locale n'est pas un adversaire et ne peut pas être ciblée. Pour être éligible aux PV de conquête (1re ou 2e place) et à la construction liée à la victoire, la Force **finale** doit atteindre ou dépasser le seuil du round. En dessous, Exploits et Forge restent possibles si leurs conditions ordinaires sont remplies. Face à la seule Résistance, la victoire donne les PV et permet la construction, sans choix entre les deux. Par exemple, pour un combat déjà terminé au round II, Force 4 ne donne pas de conquête, Force 5 atteint le seuil ; cela ne dit pas quand le combat se termine.
- **Châteaux :** une première construction obtenue par victoire, carte Thé ou capacité pose le Château incliné ; la suivante dans la même Région pour la même faction le redresse. Un Château incliné donne déjà +2 à la Force de départ si la faction participe, et compte comme Château pour la Carte soldat D. Seuls les redressés comptent au score final ; la 4e piste de Forge peut porter leur valeur jusqu'à 7 PV par Château (p. 15).

### WW-COUNT-002 — Comparaison des effectifs

**Statut : Validée pour les comparatifs de préparation et les bilans ci-dessous, aux étapes indiquées.** Sources : livret p. 2–5 et 21, plateau FR numérique et tableau visuel §1. Les quantités non ventilées dans le livret et les usages ultérieurs ne sont pas validés ici.

**Lancement [#7](https://github.com/FlowHartigan/alice_wonder/issues/7) — Validée pour la borne 2–5 seulement.** Sources : [fiche éditeur `LKY WWR-R01-FR`](https://luckyduckgames.com/france/game/710-wonderland-s-war), livret FR p. 4 étapes 7 et 11 et tableau p. 5. L'effectif de préparation est le nombre de sièges admis, pas le nombre de connexions. Aucun bilan, bloqueur, retrait ou placement du tableau ci-dessous n'est exécuté. Statuts prêts, autorité de l'hôte, révision, refus sans mutation et fermeture des admissions sont des [conventions de l'application](docs/architecture.md#lancement-et-préparation-7), pas des règles du livret. Voir la [recette du lancement](docs/rules-coverage.md#recette-du-lancement-de-la-préparation).

Sur les 13 chaises du plateau, bloquer celles indiquées ci-dessous. Les chiffres des réserves sont des bilans après la préparation, **avant** le premier Thé. Les cinq lots de 19 Alliés hors Forge restent communs à tous les effectifs. De même, chaque joueur actif reçoit un lot de `WW-SETUP-002` et dispose de 10 Partisans en réserve, 4 sur la Forge et 5 Châteaux en réserve. Les lots non choisis ne participent pas, sauf le cube de Résistance à 2J.

| Après préparation | 2J | 3J | 4J | 5J |
|---|---:|---:|---:|---:|
| Chaises bloquées | 4J et 5J | 4J et 5J | 5J | aucune |
| Thé I révélé / en pioche | 11 / 19 | 11 / 19 | 12 / 18 | 13 / 17 |
| Régions actives / marqueurs Score hors plateau | 4 / 2 | 5 / 1 | 5 / 1 | 5 / 1 |
| Pays des Merveilles visibles / en pioche | 3 / 19 | 3 / 21 | 3 / 21 | 3 / 21 |
| Quêtes dans les journaux / en pioche | 2 / 28 − R | 3 / 27 | 4 / 26 | 5 / 25 |
| Cartes Pari prises à l'étape A / non distribuées à cette étape | 0 / 20 | 12 / 8 | 16 / 4 | 20 / 0 |
| Sacs × jetons par sac | 2 × 11 | 3 × 10 | 4 × 10 | 5 × 10 |
| Forge en réserve commune | 21 | 22 | 21 | 20 |
| Folie simple non distribuée | 25 | 23 | 21 | 19 |
| Folie double non distribuée | 3 | 2 | 1 | 0 |
| Poison si Jabberwocky choisi : en réserve personnelle / hors jeu | 4 / 3 | 5 / 2 | 6 / 1 | 7 / 0 |
| Éclats de départ (total distribué / réserve en valeur) | 3 / 77 | 6 / 74 | 8 / 72 | 8 / 72 |

`R` est le nombre de Quêtes de la Région retirée, carte révélée comprise ; le livret ne donne pas `R` par Région. La ligne des Paris compte les cartes prises à A, pas les mains après K. Les Folie doubles non distribuées sont des restes d'inventaire, pas un gain de fin de Thé validé : p. 4 place la Folie sans distinguer les types, et les illustrations p. 7 montrent des simples. À 3–5, pas de Région ni de carte Pays des Merveilles à retirer, ni de cube de Résistance. Hors préparation : 4 cartes Thé avant de placer le Chef (p. 7) et pas de pioche ni de Pari en combat incontesté (p. 14). Aucun autre écart de préparation entre 3, 4 et 5 n'a été identifié dans les pages consultées.

**Contrôle :** refaire la préparation avec la même série A à 3, 4 puis 5 : retirer un bloqueur à chaque incrément, ajouter une carte Thé I visible, conserver 5 Régions et le même sac par personne. Vérifier séparément les trois lignes d'Éclats et le Poison de 5 à 7.

## 11. Interface et automatisations dérivées des règles

Pour chaque action jouable, l'implémentation doit préciser :
- Qui peut agir et à quel moment.
- Ce que les autres voient avant, pendant et après l'action.
- Quelles informations sont cachées.
- Quels choix sont obligatoires et lesquels sont facultatifs.
- Quelle réponse le serveur renvoie en cas d'action invalide.
- Comment une partie est sauvegardée ou reprise au milieu de cette étape.

## 12. Questions ouvertes à trancher

1. Quel tirage porte la boîte FR `LKY WWR-R01-FR` de l'équipe, et son livret ou un encart diffère-t-il du PDF officiel ?
2. Les comptages matériels et faces 2J confirment-ils la fiche de préparation ? Voir les [limites et contrôles restants](docs/rules-coverage.md#limites-et-suites).
3. Les illustrations et ressources du jeu sont-elles disponibles avec une autorisation d'usage numérique ?
4. Lucky Duck Games signale-t-il un erratum pour le tirage FR relevé ? Aucun applicable n'a été trouvé dans les sources consultées (§0).
5. Quels textes et traductions doivent être utilisés dans l'interface ?
6. À 2J, quand retirer les deux cartes du marché par rapport aux étapes 4–5 ? Voir `WW-SETUP-004` et `WW-COUNT-001`.
7. Quelles sont les six faces du dé Éclat FR, répétitions comprises ? L'[arbitrage web pour Premier combat](#région-de-premier-combat-au-moteur) ne tranche pas cette question matérielle.

## 13. Tableau de suivi

| Domaine | Documentation | Implémentation | Tests |
|---|---|---|---|
| Préparation | Validée sur livret · sous-périmètres et réserves en §1 et §10 | Choix exclusif en salon uniquement | Recette documentaire 2–5 ; intégration et navigateur pour le choix |
| Phase de Thé | À vérifier | Non démarrée | Non démarrés |
| Phase de Guerre | À vérifier | Non démarrée | Non démarrés |
| Sacs et jetons | À vérifier | Non démarrée | Non démarrés |
| Régions et châteaux | Noms, graphe et circuit 2J validés ; six barèmes validés pour le projet ; unités et Châteaux à vérifier | Catalogue des Régions et filtrage ; catalogue et affectation des marqueurs Score | [Régions](docs/rules-coverage.md#vérification-du-catalogue-des-régions) · [Marqueurs](docs/rules-coverage.md#tests-unitaires-des-marqueurs-score-de-région) |
| Factions et pouvoirs | Liste validée ; pouvoirs et capacités à vérifier | Liste et exclusivité en salon | [Recette du choix de faction](docs/rules-coverage.md#recette-du-choix-de-faction-en-salon) |
| Cartes et quêtes | À vérifier | Non démarrée | Non démarrés |
| Scores et fin de partie | À vérifier | Non démarrée | Non démarrés |
| Règles à deux joueurs | Préparation établie validée · ordre du filtre non validé · cas d'arrêt des pioches validés pour le projet ([#47](https://github.com/FlowHartigan/alice_wonder/issues/47)) | Non démarrée | Recettes documentaires de la préparation et de l'arrêt des pioches ; tests moteur du combat à faire dans [#22](https://github.com/FlowHartigan/alice_wonder/issues/22) |

---

**Rappel :** une fonctionnalité ne doit jamais être marquée conforme aux règles officielles tant que le comportement n'a pas été vérifié contre une source identifiée et testé.
