# Wonderland’s War — salon web

Ce prototype permet de créer un salon privé, d'inviter jusqu'à quatre autres joueurs et de partager les choix publics, les statuts prêts et le journal en temps réel. L'hôte désigne le premier joueur selon le critère du thé, puis peut lancer la préparation lorsque les 2 à 5 sièges sont prêts et ont chacun une faction distincte. Le lancement fige ces choix et ferme les admissions, mais les joueurs admis peuvent toujours reprendre leur place. En préparation, ils voient le [plateau central FR](LICENSES.md#plateau-central-fr) en lecture seule, les chaises bloquées et les PV régionaux des rounds I, II et III. À deux, le serveur révèle une Quête après l'affectation initiale des marqueurs : la Région est signalée hors jeu et seuls les quatre marqueurs conservés apparaissent. À 3–5, les cinq marqueurs apparaissent, sans révélation.

Le [paquet web v1](docs/decisions.md) provient du relevé TTS EN, avec des textes français non officiels pour le retrait à deux et le choix initial. Il ne représente pas le paquet physique français. Après les placements de score, le mélange et l'éventuel retrait, le serveur lance une fois le dé Éclat : les sièges admis voient la même valeur et la Région du marqueur Premier combat sur le plateau et en texte. Les faces web **1, 1, 1, 2, 2, 3** sont un [arbitrage produit](rules.md#région-de-premier-combat-au-moteur), pas une confirmation du dé physique FR. Le lancer ne distribue pas d'Éclats et n'ouvre pas de combat.

Les sièges admis voient aussi un aperçu de l'ordre prévu du premier Thé, en tournant depuis J1 dans l'ordre des sièges, et des Éclats de départ prévus pour chacun (dont 0 pour J5 à cinq joueurs). Aucun Éclat n'est encore crédité et le Thé n'a pas commencé. Cet aperçu est recalculé à la reprise, sans modifier la sauvegarde.

La [dotation individuelle de départ](docs/rules-coverage.md#recette-de-la-dotation-individuelle) est enregistrée par le serveur pour les éléments déterminables des étapes A–I. La fiche en lecture seule affiche la face du plateau de faction et les ressources attribuées, dont le Poison du Jabberwocky si cette faction est jouée. Pour chaque sac, elle indique uniquement le nombre de jetons (11 à deux joueurs, 10 sinon). Aucun contenu, ordre ou identifiant de jeton n'est transmis.

À l'[étape J](docs/rules-coverage.md#recette-des-quêtes-initiales-privées), chaque siège reçoit deux Quêtes privées et en garde une définitivement. L'autre retourne immédiatement dans la pioche, que le serveur remélange. Le même lien dans le même profil permet de retrouver les propositions ou la Quête gardée, sans révéler les choix des autres. Une fois le dernier choix sauvegardé, chaque siège admis voit sa propre main de Pari ([étape K](docs/rules-coverage.md#recette-des-cartes-pari-en-préparation)) : aucune carte à 2J, sinon une par autre faction admise. Il peut aussi consulter l'aide des phases et voir tous les Chefs en Bout de Table ([L–M](docs/rules-coverage.md#recette-des-aides-et-des-chefs-en-bout-de-table)). Ces éléments sont en lecture seule et se retrouvent au rechargement. Aucune série d'Alliés n'est active, les Éclats de départ ne sont pas crédités et le premier Thé ne démarre pas.

## Démarrer en local

Prérequis : Node.js 24 ou plus récent et npm. Sous PowerShell, utilisez `npm.cmd` si `npm` est bloqué par la politique d'exécution.

```sh
npm ci
npm run dev
```

Ouvrir <http://127.0.0.1:5173>. Pour tester avec deux joueurs sur une seule machine, ouvrir le lien d'invitation dans un deuxième navigateur ou un profil séparé. Depuis un autre onglet du même profil, le lien reprend la même place.

## Essayer à deux ordinateurs

Depuis l'ordinateur qui héberge le salon, sur un réseau local de confiance (PowerShell) :

```powershell
npm.cmd run build
$env:HOST = "0.0.0.0"
npm.cmd start
```

1. Ouvrir `http://<adresse-IP-locale-de-l-hôte>:3000` depuis le **premier** ordinateur aussi, pour que son lien d'invitation soit joignable. Si nécessaire, relever l'adresse IPv4 avec `ipconfig` et autoriser le port TCP 3000 sur le profil réseau privé.
2. Créer le salon et partager le lien (ou l'adresse et le code) avec le second ordinateur, sur le même réseau.
3. Rejoindre le salon, choisir une faction disponible, cliquer « Je suis prêt » et vérifier les changements chez l'hôte. Recharger la page du second joueur : même place, même faction, même statut, même journal.
4. Vérifier qu'aucun premier joueur n'est désigné à l'arrivée. Après accord de la table sur la personne ayant bu du thé le plus récemment, l'hôte choisit son siège dans « Premier joueur ». Recharger les deux pages : le choix est identique et seul l'hôte peut le modifier.
5. Quand tout le monde est prêt, cliquer « Lancer la préparation » côté hôte. Si l'invité a été désigné, les deux navigateurs voient l'invité en J1 avec 2 Éclats prévus et l'hôte en J2 avec 1, même si l'hôte occupe le siège 1. Vérifier les 11 chaises ouvertes (4J et 5J bloquées), la même Quête révélée, la même Région « Hors jeu » et les quatre marqueurs de score, sur l'image et dans le tableau accessible avec `Tab`. Vérifier que les deux navigateurs affichent le même dé et un seul marqueur Premier combat dans une Région active, avec un récapitulatif textuel. Un troisième profil ne voit pas ces informations ; les deux profils admis retrouvent les mêmes résultats au rechargement du lien.
6. Dans « Votre Quête initiale », vérifier les deux titres différents selon le siège, les textes Exploit et Objectif et la mention de source non officielle. Recharger avant le choix, puis garder une carte sur un seul siège. Après rechargement, seule sa Quête gardée réapparaît ; ni l'autre siège ni le journal public ne signalent ce choix, et « Vos cartes Pari » est encore absent.
7. Garder la dernière Quête depuis l'autre navigateur. Vérifier l'apparition de « Vos cartes Pari » sur les deux écrans sans recharger, puis sa stabilité au rechargement. À deux, le panneau indique qu'il n'y a aucune carte ; à 3–5, il ne liste que les autres factions admises. Aucun bouton pour jouer un Pari, ni lancement du Thé.

SQLite enregistre l'état dans `.data/lobbies.sqlite` par défaut (dossier configurable avec `DATA_DIR`). Au redémarrage, ne changez pas l'adresse utilisée dans le navigateur ni le dossier de données pour reprendre le salon.

### Mettre à jour un salon existant (v1 à v9 → v10)

1. Préparez le code mis à jour et compilez le client (`npm ci`, `npm run build`, Node.js ≥ 24) sans lancer un deuxième serveur sur la base active.
2. Lors d'une fenêtre de maintenance, arrêtez l'ancien serveur, puis faites une sauvegarde SQLite cohérente hors du dossier de données (conservez les éventuels fichiers `-wal` / `-shm` avec la base si vous faites une copie à froid). Notez la version sauvegardée (`PRAGMA user_version;`, normalement `9` sur le serveur précédent) et la révision du code correspondant. Ne supprimez pas la base existante.
3. Lancez `npm start` avec **le même dossier de données** (chemin absolu `DATA_DIR` si vous changez de checkout) et les mêmes paramètres réseau (`HOST`, `PORT`, `PUBLIC_ORIGIN` si défini). Toutes les étapes de migration se font dans une transaction au démarrage et portent `PRAGMA user_version` à `10`. Pour revenir en arrière, arrêtez le serveur v10 et restaurez la sauvegarde d'avant migration avec le code correspondant : les anciennes versions ne savent pas ouvrir une base v10. Ne modifiez pas le numéro de version à la main.
4. Rechargez le lien **sur la même origine et dans le même profil navigateur**, sans vider le stockage local. Les places et les liens sont conservés. En partant de v1, les anciens sièges prêts doivent choisir une faction puis se redéclarer prêts (migration #5) ; en partant de v2, factions et statuts sont conservés. L'hôte désigne J1 explicitement dans les deux cas. À partir de v3, une désignation valide est conservée. Aucun salon ouvert, même prêt, n'est lancé automatiquement.

Les migrations historiques ajoutent seulement les placements, le retrait 2J, le dé et la dotation A–I qui manquent à la version de départ. v8 → v9 ajoute les offres J des seules préparations initiales validées : à deux joueurs, la révélation et l'ordre actif issu de #65 sont conservés sans remélange ; à 3–5 joueurs, le paquet de 30 est mélangé une seule fois. Les marqueurs, le dé, les sacs, les identifiants, les sessions, les reçus et le journal du salon ne sont pas modifiés par cette étape.

v9 → v10 ajoute les réserves centrales à partir des sacs enregistrés, avant ou après le dernier choix de Quête. Aucun tirage, crédit d'Éclats, changement de phase ou de vue. Un salon ouvert, même prêt, ne reçoit aucun stock. Un snapshot incohérent ou une écriture échouée annule la migration entière, y compris la version de la base. À la reprise ou au redémarrage en v10, aucun tirage ni réparation.

## Vérifier

```sh
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
```

[Architecture](docs/architecture.md) · [Décisions](docs/decisions.md) · [Couverture des règles](docs/rules-coverage.md)
