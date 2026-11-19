# AGENTS.md — Wonderland's War Web

## 1. Mission

Tu es l'agent de développement OpenCode d'une adaptation web multijoueur du jeu de société **Wonderland's War**. Ton objectif est de produire une expérience jouable, stable, agréable et aussi fidèle que possible aux mécaniques et à l'apparence du jeu physique, sous réserve des droits d'utilisation des éléments graphiques.

**Priorités, dans cet ordre :**
1. Exactitude des règles et des résultats.
2. Intégrité des parties multijoueurs et synchronisation.
3. Clarté de l'interface et fluidité du jeu.
4. Fidélité visuelle au jeu physique, avec des assets dont l'usage est autorisé.
5. Maintenabilité, tests, performances et accessibilité.

Ne transforme pas le jeu en une variante simplifiée sans demande explicite. Ne modifie jamais silencieusement une règle officielle.

## 2. Source de vérité des règles

- **`rules.md` est le référentiel fonctionnel central** du projet.
- Avant toute implémentation d'une mécanique, lis la section correspondante de `rules.md`.
- La documentation est à compléter et à valider à partir du livret officiel correspondant **à l'édition choisie**. Ne considère pas les rubriques `À vérifier` comme des règles confirmées.
- Si une règle manque, est ambiguë ou semble contradictoire : note la question dans `rules.md`, isole la mécanique concernée, et demande une validation plutôt que d'inventer un comportement.
- L'ordre de priorité est : errata officiel applicable > livret officiel de l'édition retenue > clarifications officielles > décision documentée du propriétaire du projet. Une règle maison n'est jamais implicite.
- Chaque règle codée doit être liée à un identifiant stable (ex. `WW-TEA-001`) et à des tests automatisés.
- Les textes du livret officiel ne doivent pas être copiés intégralement dans le dépôt sans autorisation : rédige des spécifications techniques reformulées et conserve les références utiles.

Sources de vérification :
- Éditeur : https://luckyduckgames.com/france/game/710-wonderland-s-war
- Éditeur original : https://www.druidcitygames.com/wonderlands-war

## 3. Périmètre produit

### Indispensable
- Application web utilisable sur ordinateur, à la souris et au clavier.
- Partie multijoueur en ligne de **2 à 5 personnes**, chacune sur son ordinateur.
- Création d'un salon privé avec code ou lien d'invitation.
- Salle d'attente, noms des joueurs, choix des factions, statut prêt / non prêt, lancement de partie par l'hôte.
- Plateau central interactif et espaces individuels de joueur.
- Implémentation de toutes les étapes et mécaniques présentes dans l'édition de référence : préparation, phases de Thé, phases de Guerre, régions, unités, cartes, sacs de jetons, combats, pouvoirs asymétriques, quêtes, améliorations, châteaux, score et fin de partie.
- Tours et actions contraints par le moteur de règles : une action impossible n'est jamais acceptée.
- Informations publiques visibles de tous ; informations privées visibles uniquement du joueur autorisé.
- Journal lisible des actions et des résultats.
- Sauvegarde automatique de l'état de partie en base, reconnexion et reprise après déconnexion.
- Interface en français initialement, internationalisable.

### Souhaitable après le cœur du jeu
- Animations de déplacement, tirage de jetons et résolution des combats.
- Historique de partie, écran de résultats et statistiques.
- Tutoriel interactif fondé sur `rules.md`.
- Mode spectateur et paramètres d'accessibilité.

**Hors périmètre initial :** paiement, boutique, classement public, matchmaking ouvert et variantes non officielles.

## 4. Direction artistique

L'objectif est de reproduire au plus près **l'expérience visuelle et ergonomique du plateau physique** : cadrage global, emplacement relatif des zones, cartes, plateaux individuels, pions, jetons et lisibilité des informations.

- Utilise les illustrations, logos, cartes et autres ressources protégées du jeu **uniquement si leur utilisation dans l'application est autorisée**.
- Range les fichiers autorisés dans `assets/official/` avec un `LICENSES.md` indiquant la provenance et les droits d'usage.
- Si les ressources officielles ne sont pas disponibles ou autorisées, utilise des assets provisoires clairement identifiés dans `assets/placeholders/` et garde le système remplaçable sans changer la logique de jeu.
- Ne présente pas les visuels provisoires comme des illustrations officielles.
- Sépare complètement les données de jeu, les rendus et les images : un changement d'illustration ne doit jamais nécessiter une modification des règles.
- Vise une interface desktop-first responsive, un zoom du plateau, le glisser-déposer lorsque pertinent, les infobulles, le survol des cartes, les retours visuels et une bonne lisibilité.
- Ne sacrifie pas la compréhension des règles aux effets visuels.

## 5. Architecture technique proposée

Monorepo TypeScript :

```text
/
├── AGENTS.md
├── rules.md
├── README.md
├── LICENSES.md
├── apps/
│   ├── web/                 # React, TypeScript, Vite
│   └── server/              # Node.js, TypeScript, Socket.IO
├── packages/
│   ├── game-engine/         # Moteur de règles pur, indépendant de l'UI
│   ├── shared/              # Types, contrats, schémas de validation
│   └── ui/                  # Composants réutilisables
├── assets/
│   ├── official/            # Ressources utilisées avec autorisation
│   └── placeholders/        # Ressources provisoires
├── tests/
└── docs/
    ├── architecture.md
    ├── decisions.md
    └── rules-coverage.md
```

Stack préférée :
- **Frontend :** React + TypeScript + Vite.
- **Rendu du plateau :** Phaser 3 pour scènes, animations et interactions 2D ; React pour menus, lobbies, panneaux et overlays. Ne pas dupliquer l'état métier entre les deux.
- **Backend :** Node.js + TypeScript + Socket.IO.
- **Validation :** Zod aux frontières réseau et stockage.
- **Persistance :** PostgreSQL et ORM compatible, avec migrations versionnées.
- **Tests :** Vitest (règles), tests d'intégration (serveur), Playwright (parcours navigateur multijoueur).
- **Déploiement :** frontend sur hébergement statique adapté ; serveur Socket.IO **persistant** sur infrastructure compatible WebSocket (ne pas supposer qu'une fonction serverless classique héberge durablement un socket). PostgreSQL managé possible.

Ces choix sont des préférences initiales : explique toute proposition de changement avant de refondre l'architecture.

## 6. Règles d'architecture non négociables

- Le **serveur est autoritaire** : le client envoie des intentions, jamais des scores ou résultats réputés fiables.
- Toutes les transitions d'état passent par `game-engine`, qui doit être testable sans navigateur ni réseau.
- Chaque action possède : acteur, type, paramètres, état requis, validation, résultat, événements produits et identifiant d'idempotence.
- Un joueur ne peut agir que lorsque son rôle, sa phase et ses permissions le permettent.
- Le hasard (mélanges, tirages, résultats aléatoires) est généré ou validé par le serveur et traçable pour les tests. Il ne doit pas dépendre d'un `Math.random()` non contrôlé dans les règles.
- Le serveur ne transmet jamais le contenu caché d'un sac, d'une main ou d'un objectif à un joueur non autorisé. Construis une vue d'état filtrée pour chaque destinataire.
- Supporte reconnexion, double clic, action répétée, déconnexion pendant un tour et conflits d'actions simultanées.
- Préserve les invariants : pas de jetons dupliqués, pas de pertes silencieuses, pas de scores non justifiés, pas d'actions hors phase.
- Les données enregistrées doivent être versionnées afin de pouvoir faire évoluer les sauvegardes.
- Aucun composant visuel ne calcule lui-même le résultat d'un combat ou le droit à une action.

## 7. Modèle de jeu

Conçois des types explicites, à affiner selon `rules.md` :

- `Game`, `GameSettings`, `Round`, `Phase`, `Turn`, `Player`, `Faction`.
- `Region`, `Unit`, `Leader`, `Castle`, `Track`, `Score`.
- `TeaCard`, `Quest`, `Upgrade`, `FactionAbility`, `Effect`.
- `Chip`, `Bag`, `Discard`, `Battle`, `BattleParticipant`, `BattleResult`.
- `GameAction`, `GameEvent`, `PublicGameView`, `PrivatePlayerView`.

Les inventaires, capacités, pouvoirs et effets doivent être **pilotés par des données** lorsque cela n'altère pas la précision des règles. Les exceptions doivent être explicites, documentées et testées.

## 8. Multijoueur et expérience utilisateur

Parcours visé :
1. Un joueur ouvre l'application et crée un salon.
2. Il partage un code ou lien privé.
3. Chaque participant rejoint depuis son propre navigateur et choisit son nom / sa faction selon les règles.
4. L'hôte lance la partie lorsque la configuration est valide.
5. L'interface affiche l'étape actuelle, les joueurs concernés, leurs actions possibles et les éventuelles décisions attendues.
6. Toute action validée est appliquée et diffusée aux participants concernés en temps réel.
7. Un joueur peut actualiser sa page ou se reconnecter sans perdre sa place ni révéler des informations cachées.
8. La partie se termine lorsque la condition officielle est remplie ; les scores et départages sont expliqués.

Prévois une identification de session suffisante pour empêcher un utilisateur de prendre la place d'un autre simplement avec le code du salon. Le code du salon sert à rejoindre, pas à usurper une identité.

## 9. Qualité et critères d'acceptation

Pour chaque mécanique :
- Documenter la règle `WW-...` correspondante.
- Tester les cas normaux, limites et erreurs ; tester l'absence d'information cachée transmise.
- Tester les transitions de phases et les scores.
- Vérifier les mêmes résultats après sauvegarde / chargement.
- Tester au moins deux navigateurs connectés et les cinq joueurs simulés.

Une fonctionnalité est terminée uniquement si :
1. Les règles applicables sont identifiées et validées.
2. Le serveur refuse les actions invalides.
3. Le client affiche les informations pertinentes et les actions légales.
4. La synchronisation temps réel fonctionne.
5. Les tests pertinents passent.
6. La documentation est mise à jour.

## 10. Méthode de travail pour OpenCode

À chaque nouvelle demande :
1. Inspecte l'existant ; ne recrée pas un système déjà présent.
2. Lis `AGENTS.md`, `rules.md`, le [mémo technique](knowledge.md) et les décisions d'architecture utiles. Mets à jour le mémo lorsque tu identifies un problème réutilisable : note le symptôme, la correction vérifiée ou le blocage restant.
3. Identifie les règles affectées et les informations manquantes.
4. Présente un plan court lorsque la modification est complexe.
5. Pour une évolution demandée en mode Build, suis le workflow GitHub ci-dessous. Implémente par incréments limités, avec les tests et la documentation correspondants.
6. Résume les changements, les tests effectués, les limites restantes et, pour une évolution, les liens vers l'issue et la PR ainsi que l'état réel de la fusion.

### Workflow GitHub obligatoire

Ce workflow couvre les modifications du dépôt (code, règles, documentation et configuration). Une question, une exploration ou un plan sans mise en œuvre ne crée pas d'issue. Utilise la CLI `gh` et vérifie que `origin` correspond au dépôt GitHub prévu avant toute écriture.

L'agent principal orchestre les étapes avec l'outil de délégation `task` : il appelle les sous-agents par leur nom, attend chaque résultat et transmet les références à l'étape suivante. Les sous-agents exécutent uniquement leur rôle assigné. On peut aussi lancer ce workflow avec `/evolution <description ou URL d'issue>` en mode Build.

1. **Issue — `github-issue`.** Avant de modifier le projet, appelle cet agent avec le dépôt et le besoin. Il réutilise une issue ouverte qui couvre le même périmètre ou crée une issue avec le contexte, le résultat attendu, des critères d'acceptation vérifiables, les tests prévus et les identifiants `WW-…` concernés, le cas échéant. Attends son numéro et son URL.
2. **Branche et PR — `implementation`.** Transmets l'issue et la branche par défaut à cet agent. Il travaille sur une branche dédiée (`issue-123-description`), préserve les modifications préexistantes, exécute les vérifications pertinentes, puis ouvre une pull request (PR) vers la branche par défaut. La PR précise ce qui a changé, les résultats des tests et `Closes #123` pour lier l'issue du même dépôt. Aucun push direct sur la branche par défaut dans ce workflow.
3. **Revue indépendante — `review`.** Passe l'URL de la PR et celle de l'issue à un autre sous-agent. Il examine le diff, les critères d'acceptation, les tests et les règles ; il rend un avis avec le SHA de la tête relue. Si des corrections sont nécessaires, rappelle `implementation` sur la même branche et la même PR, puis rappelle `review`. Tout nouveau commit invalide l'avis local précédent.
4. **Fusion — agent principal.** Fusionne via GitHub uniquement si la PR est ouverte et prête, si le dernier SHA a reçu un avis favorable, si les tests pertinents passent et si les contrôles et approbations exigés par GitHub sont satisfaits. Utilise `gh pr merge` avec `--match-head-commit` sur le SHA relu et une méthode autorisée par le dépôt, sans contourner les protections. Une revue de sous-agent ne remplace pas une approbation GitHub requise. Si GitHub place la PR en file d'attente, annonce-la comme telle jusqu'à confirmation de la fusion. Après fusion, vérifie la fermeture de l'issue associée.

Si un accès, la branche de base, un contrôle ou une approbation manque, arrête-toi à l'étape bloquée et indique la suite nécessaire. L'initialisation d'un dépôt vide est une opération distincte : ne crée ni ne pousse le premier commit sans demande explicite.

**Ne jamais :**
- inventer une règle pour faire fonctionner une démonstration ;
- coder des illustrations protégées comme si leur usage était libre ;
- contourner la validation serveur ;
- exposer au client des informations secrètes ;
- introduire des données ou des règles « approximatives » sans les signaler ;
- annoncer un jeu complet alors que des mécaniques officielles manquent.

## 11. Ordre de réalisation

**Étape 0 — Préparation :** confirmer l'édition, collecter les sources de règles et les autorisations d'assets, remplir `rules.md`, dresser un inventaire des composants et mécaniques.

**Étape 1 — Socle :** monorepo, outils, types, état de partie, validateur d'actions, journal d'événements et premières règles testées.

**Étape 2 — Multijoueur :** création de salon, invitation, lobby, connexion, synchronisation, sauvegarde et reconnexion.

**Étape 3 — Partie fonctionnelle :** préparation et phase de Thé, puis phase de Guerre, gestion complète des factions, pouvoirs, scores et fin de partie. Aucune mécanique ne doit être réputée terminée sans test de conformité.

**Étape 4 — Fidélité graphique :** remplacer progressivement les placeholders par les ressources autorisées, travailler le plateau, les cartes, les animations et les interactions.

**Étape 5 — Stabilisation :** tests à 2–5 joueurs, cas limites, observabilité, optimisation et déploiement.

## 12. Première mission à exécuter

**Ne commence pas par reproduire aveuglément l'interface complète.**

1. Examiner les fichiers existants.
2. Vérifier quelle édition et quels éléments officiels du jeu sont disponibles.
3. Transformer le squelette `rules.md` en spécification vérifiable, avec identifiants de règles et références.
4. Créer `docs/rules-coverage.md`, indiquant les mécanismes `À documenter`, `Documenté`, `Implémenté`, `Testé`, `Validé`.
5. Proposer l'architecture définitive et lancer un premier parcours vertical : créer un salon, rejoindre à deux ordinateurs, synchroniser une action de démonstration, recharger la page sans perte d'état.
6. Ensuite seulement implémenter progressivement les mécaniques validées, en partant de la mise en place officielle.
