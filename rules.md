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

- **1–2.** Installer le plateau ; mélanger les 6 marqueurs Score et en poser 1 au hasard par Région. Ranger le 6e. Le circuit horaire lu sur le plateau part du Donjon rouge, puis Forêt de Tulgey → Jardin des Fleurs vivantes → Mare de Larmes → Comté de la Déraison → Donjon rouge.
- **3.** Choisir un paquet d'Alliés A, B, C ou D (A conseillé, pas imposé, pour la première partie). Aligner ses 5 cartes et la carte Forge avec les jetons correspondants, en distinguant les niveaux faible et fort ; Forge n'a que le niveau faible. Ranger les 15 autres cartes Allié. Cette recette porte sur un paquet complet, pas sur le mélange de séries évoqué p. 9.
- **4–5.** Mélanger les cartes Pays des Merveilles et en révéler 3 ; garder la pioche face cachée. Sur une carte Habitant, poser sa silhouette ; sur une carte Objet, poser ses deux jetons. Le texte de l'étape 5 parle des « jetons de l'Habitant », mais son illustration et la distinction p. 8 les rattachent à l'Objet. Mettre de côté le matériel non exposé. À 2J, respecter les exclusions de §10 ; le moment du filtrage reste ouvert.
- **6–9.** Poser au centre du Thé la réserve de Folie, les Éclats et le dé. Bloquer les chaises selon §10 ; séparer et mélanger les trois paquets Thé, garnir d'une carte Thé I face visible chaque chaise non bloquée. Laisser le reste du paquet I près du Bout de Table et réserver II et III pour plus tard. Le Bout de Table et l'emplacement du paquet ne sont pas des chaises à garnir.
- **10.** Mélanger les Quêtes et poser la pioche face cachée.
- **11.** À 3–5J, poser Premier combat au Donjon rouge, puis lancer le dé Éclat et avancer d'autant de Régions en sens horaire. À 2J, retirer la Région tirée, ses Quêtes et son marqueur Score, puis placer et déplacer Premier combat selon `WW-COUNT-001`. Ce lancer ne distribue pas d'Éclats. Préparer ensuite les factions ; avant le premier Thé, toutes les Régions sont sans unité ni Château.

**Contrôle :** avec un marché d'essai mêlant Habitant et Objet, obtenir 3 cartes correctement équipées. À 4J avec un résultat de dé 2, conserver le bloqueur sur 5J et placer Premier combat au Jardin des Fleurs vivantes, sans ajouter d'Éclats aux joueurs.

### WW-SETUP-005 — Initiative et Éclats du round I

**Statut : Validée pour le round I : critère de J1, désignation par l'hôte, ordre des sièges et Éclats.** Sources : livret p. 3, 5 N et tableau « À vos marques, prêts… par-thé ! », p. 6 et 11 ; [décision produit](docs/decisions.md#décisions).

Une fois la table et les factions prêtes, la personne qui a bu du thé le plus récemment commence. **Décision produit :** l'hôte désigne cette personne selon l'accord des joueurs ; l'hôte n'est pas automatiquement J1. À partir de J1, les sièges suivants en sens horaire donnent J2, J3, etc. (ordre des joueurs, indépendant du sens de déplacement d'Alice ou du marqueur Premier combat). Le choix de J1, l'ordre et les Éclats placés à côté des plateaux sont publics. Si la table ne s'accorde pas, aucun départage automatique n'est établi. L'initiative des rounds II et III relève de `WW-FLOW-003` (p. 6) : moins de PV, puis moins d'unités dans les Régions, puis plus d'Éclats ; la p. 6 ne tranche pas l'égalité persistante. Pas de nouvelle distribution d'Éclats de départ.

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

**WW-WAR-004** — À vérifier, p. 12–13, 21–22 et 24. L'abandon volontaire est irréversible et n'est possible qu'après la résolution complète de la première pioche ; la Force acquise compte toujours. La règle générale met fin au combat si tous ont échoué ou abandonné, si le seul joueur encore en lice est seul en tête, ou si au moins un atteint 25 (égalité si plusieurs au cours de la même pioche). L'articulation avec la Résistance locale reste à clarifier.

**WW-WAR-005** — À vérifier, p. 10, 13 et 22–24. Folie : placer sur la piste et perdre une unité par icône, Chef retiré en dernier. Le Bouclier intact peut annuler le jeton et le renvoyer au sac, en se brisant. L'échec faute d'unités annule la Force, épuise les Actifs, exclut le joueur du combat et répare le Bouclier. Le Poison fait perdre une unité puis retourne au Jabberwocky (ou au sac si contré), sans avancer la piste de Folie.

**WW-WAR-006** — À vérifier, p. 13 et 22–23. Ordre si nécessaire : Folie et échec, effets sur soi et ses jetons, puis effets sur des adversaires. Si un ordre entre joueurs est requis : moins de PV, puis plus d'Éclats. Vérifier égalité persistante et interactions texte par texte.

**WW-WAR-007** — À vérifier, p. 14–15 et 21. Rang selon la Force, hors échecs ; le premier gagne les PV régionaux du round et construit s'il n'a pas déjà de Château. Le deuxième gagne la moitié des PV. Égalité au premier rang : chaque ex æquo choisit PV ou construction, sans deuxième prix ; égalité au deuxième : partage arrondi au supérieur. À 3–5, présence unique : choisir PV ou construction, sans pioche ni Pari. Tester le cas d'un Château déjà présent lors d'un choix et les exceptions de `WW-COUNT-001`.

**WW-WAR-008** — À vérifier, p. 14–15. Ordre indiqué : conquête/Château, Quêtes, capacités de fin, Forge, Paris, conclusion. Épuiser les Actifs restants, remettre les repères de Force au départ, laisser la Folie sur sa piste, continuer vers la Région suivante.

**WW-WAR-009** — À vérifier, p. 12, 14–15 et 21. À 3–5, après détermination de la Force de départ d'un combat disputé, les non-participants peuvent miser simultanément et en secret sur le vainqueur. Réussite : un Allié faible choisi ; erreur : un Éclat ; égalité en tête : ni gain ni pénalité. Vérifier la résolution des paris si tous les combattants échouent.

### Arrêt du combat à 2J — questions bloquantes

**Statut : non validé — `WW-WAR-004`, [#22](https://github.com/FlowHartigan/alice_wonder/issues/22), hors recette de préparation [#2](https://github.com/FlowHartigan/alice_wonder/issues/2).** La p. 21 arrête le combat dès que le dernier ou seul joueur en lice égale ou dépasse la Résistance locale. Les p. 12–13 et 24 arrêtent le combat quand le dernier joueur en lice est seul en tête, y compris par rapport à un joueur ayant abandonné dont la Force compte encore. Le livret FR ne dit pas si le seuil remplace ce critère ou s'y ajoute, ni à quel moment l'évaluer dans tous les cas. Ne retenir aucun comportement par défaut ; le seuil de récompense à la **Force finale** (`WW-COUNT-001`) ne tranche pas l'arrêt des pioches.

1. **Round II, Force 4 après la première pioche, seuil 5.** Seul joueur avec des unités dans la Région, il part à Force 3, pioche un jeton de Force 1, reste en lice et veut continuer. Peut-il repiocher pour tenter d'atteindre 5 (p. 21), ou le critère ordinaire (p. 12–13) arrête-t-il le combat à 4 ? Vérifier aussi le cas où l'autre joueur a commencé ce combat mais échoue à la première pioche.
2. **Round II, Force de départ 5 avant toute pioche.** Seul joueur avec des unités, doit-il résoudre la première pioche (p. 12 et FAQ « Abandonner un combat » p. 22), ou l'arrêt immédiat de la p. 21 précède-t-il cette pioche ? La FAQ rappelle la règle générale sans traiter cette exception 2J.

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

## 10. Règles spécifiques selon le nombre de joueurs

### WW-COUNT-001 — Exceptions à deux joueurs

**Statut : Validée pour la préparation 2J établie ci-dessous (livret p. 4–5 et 21), hors ordre du filtrage du marché et données individuelles non établies.** Les règles de jeu résumées ensuite sont `Documentées`, hors validation de ce jalon ; l'arrêt des pioches est isolé sous [`WW-WAR-004`](#arrêt-du-combat-à-2j--questions-bloquantes), [#22](https://github.com/FlowHartigan/alice_wonder/issues/22).

- **Marché :** retirer l'**Amulette de la Duchesse** et le **Lièvre de Mars** du paquet Pays des Merveilles (p. 21). Le marché initial doit donc compter trois cartes autorisées, avec le matériel correspondant ; ne pas y installer la paire de jetons Objet de l'Amulette ni la silhouette du Lièvre. Retirer les deux cartes **avant** mélange et révélation est une proposition de déroulé, **non validée** : p. 21 ne situe pas le retrait par rapport aux étapes 4–5, et ne précise ni comment traiter une carte exclue déjà révélée ni où ranger son matériel.
- **Région :** au renvoi de la p. 4 étape 11, révéler 1 Quête au hasard : sa Région d'Exploit devient inutilisée. Retirer toutes les Quêtes de cette Région, y compris celle révélée, et son marqueur Score posé au hasard ; ne pas y placer d'unité ni de Château et ne pas y combattre. Placer Premier combat dans la Région suivante en sens horaire **avant** le lancer, puis avancer du résultat du dé sans compter la Région retirée. La Quête utilisée pour le tirage de Région est révélée publiquement, pas les Quêtes initiales conservées.
- **Plateaux et ressources :** bloquer les deux chaises 4J/5J ; prendre la face au cadre doré « 2 JOUEURS » en bas à gauche. Ajouter un jeton Forge dans chaque sac, ne distribuer aucune carte Pari, donner 4 Poison si le Jabberwocky joue et appliquer la ligne d'Éclats 2/1. Réserver le cube d'une faction non jouée pour la Résistance locale ; les deux cubes des joueurs vont sur Combat 0. Le cube réservé est posé sur **3 / 5 / 7** au début de la Guerre du round I / II / III, pas au départ du Thé I (p. 21).

**Contrôle de préparation :** avec le Donjon rouge révélé et un dé de 2, partir de la Forêt de Tulgey et finir à la Mare de Larmes ; après le Comté, le circuit reprend à la Forêt. Vérifier le résultat des exclusions au marché et dans les Quêtes, les faces 2J, le cube distinct, les 11 jetons par sac et l'absence de cartes Pari. Le relevé des cinq faces et le nombre de Quêtes à retirer par Région nécessitent un catalogue FR ; l'adjacence pour les effets hors circuit des combats n'est pas déduite du saut de Région.

#### Règles de jeu 2J — hors recette de préparation

Sources : livret p. 7, 12–15, 21 et clarification Carte soldat D p. 23.

- **Thé et Guerre :** chaque joueur doit gagner **5** cartes Thé, au lieu de 4, avant de placer son Chef. Aucun pari ni conquête automatique si une seule faction est présente : elle combat aussi. La Résistance locale n'est pas un adversaire et ne peut pas être ciblée. Pour être éligible aux PV de conquête (1re ou 2e place) et à la construction liée à la victoire, la Force **finale** doit atteindre ou dépasser le seuil du round. En dessous, Exploits et Forge restent possibles si leurs conditions ordinaires sont remplies. Face à la seule Résistance, la victoire donne les PV et permet la construction, sans choix entre les deux. Par exemple, pour un combat déjà terminé au round II, Force 4 ne donne pas de conquête, Force 5 atteint le seuil ; cela ne dit pas quand le combat se termine.
- **Châteaux :** une première construction obtenue par victoire, carte Thé ou capacité pose le Château incliné ; la suivante dans la même Région pour la même faction le redresse. Un Château incliné donne déjà +2 à la Force de départ si la faction participe, et compte comme Château pour la Carte soldat D. Seuls les redressés comptent au score final ; la 4e piste de Forge peut porter leur valeur jusqu'à 7 PV par Château (p. 15).

### WW-COUNT-002 — Comparaison des effectifs

**Statut : Validée pour les comparatifs de préparation et les bilans ci-dessous, aux étapes indiquées.** Sources : livret p. 2–5 et 21, plateau FR numérique et tableau visuel §1. Les quantités non ventilées dans le livret et les usages ultérieurs ne sont pas validés ici.

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
7. Arbitrer les [cas d'arrêt de `WW-WAR-004`](#arrêt-du-combat-à-2j--questions-bloquantes) dans [#22](https://github.com/FlowHartigan/alice_wonder/issues/22), sans les déduire de la mise en place ni du seuil de récompense.

## 13. Tableau de suivi

| Domaine | Documentation | Implémentation | Tests |
|---|---|---|---|
| Préparation | Validée sur livret · sous-périmètres et réserves en §1 et §10 | Non démarrée | Recette documentaire 2–5 |
| Phase de Thé | À vérifier | Non démarrée | Non démarrés |
| Phase de Guerre | À vérifier | Non démarrée | Non démarrés |
| Sacs et jetons | À vérifier | Non démarrée | Non démarrés |
| Régions et châteaux | À vérifier | Non démarrée | Non démarrés |
| Factions et pouvoirs | À vérifier | Non démarrée | Non démarrés |
| Cartes et quêtes | À vérifier | Non démarrée | Non démarrés |
| Scores et fin de partie | À vérifier | Non démarrée | Non démarrés |
| Règles à deux joueurs | Préparation établie validée · ordre du filtre non validé · jeu hors recette, arrêt suivi dans #22 | Non démarrée | Recette documentaire de la préparation seulement |

---

**Rappel :** une fonctionnalité ne doit jamais être marquée conforme aux règles officielles tant que le comportement n'a pas été vérifié contre une source identifiée et testé.
