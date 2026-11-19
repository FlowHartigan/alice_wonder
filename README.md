# Wonderland’s War — salon web

Ce prototype permet de créer un salon privé, d'inviter jusqu'à quatre autres joueurs et de partager les choix, les statuts prêts et le journal en temps réel. L'hôte désigne le premier joueur selon le critère du thé, puis peut lancer la préparation lorsque les 2 à 5 sièges sont prêts et ont chacun une faction distincte. Le lancement fige ces choix et ferme les admissions, mais les joueurs admis peuvent toujours reprendre leur place. En préparation, ils voient le [plateau central FR](LICENSES.md#plateau-central-fr) en lecture seule, les chaises bloquées et les PV régionaux des rounds I, II et III. À deux, le serveur révèle une Quête après l'affectation initiale des marqueurs : la Région est signalée hors jeu et seuls les quatre marqueurs conservés apparaissent. À 3–5, les cinq marqueurs apparaissent, sans tirage de Quête.

Le [paquet web v1](docs/decisions.md) est une traduction du relevé TTS EN, autorisée uniquement pour ce retrait initial à deux. Il ne représente pas le paquet physique français. Aucune Quête n'est distribuée, aucun marqueur Premier combat n'est placé et la mise en place complète reste à venir.

Les sièges admis voient aussi un aperçu de l'ordre prévu du premier Thé, en tournant depuis J1 dans l'ordre des sièges, et des Éclats de départ prévus pour chacun (dont 0 pour J5 à cinq joueurs). Aucun Éclat n'est encore crédité et le Thé n'a pas commencé. Cet aperçu est recalculé à la reprise, sans modifier la sauvegarde.

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
5. Quand tout le monde est prêt, cliquer « Lancer la préparation » côté hôte. Si l'invité a été désigné, les deux navigateurs voient l'invité en J1 avec 2 Éclats prévus et l'hôte en J2 avec 1, même si l'hôte occupe le siège 1. Vérifier les 11 chaises ouvertes (4J et 5J bloquées), la même Quête révélée, la même Région « Hors jeu » et les quatre marqueurs inchangés, sur l'image et dans le tableau accessible avec `Tab`. Un troisième profil ne peut plus rejoindre ; les deux profils admis retrouvent le même résultat au rechargement du lien.

SQLite enregistre l'état dans `.data/lobbies.sqlite` par défaut (dossier configurable avec `DATA_DIR`). Au redémarrage, ne changez pas l'adresse utilisée dans le navigateur ni le dossier de données pour reprendre le salon.

### Mettre à jour un salon existant (v1 à v5 → v6)

1. Préparez le code mis à jour et compilez le client (`npm ci`, `npm run build`, Node.js ≥ 24) sans lancer un deuxième serveur sur la base active.
2. Lors d'une fenêtre de maintenance, arrêtez l'ancien serveur, puis faites une sauvegarde SQLite cohérente hors du dossier de données (conservez les éventuels fichiers `-wal` / `-shm` avec la base si vous faites une copie à froid). Ne supprimez pas la base existante.
3. Lancez `npm start` avec **le même dossier de données** (chemin absolu `DATA_DIR` si vous changez de checkout) et les mêmes paramètres réseau (`HOST`, `PORT`, `PUBLIC_ORIGIN` si défini). La migration se fait dans une transaction au démarrage. Pour revenir à une ancienne version, arrêtez le serveur v6 et restaurez la sauvegarde d'avant migration avec l'ancien code : les anciennes versions ne savent pas ouvrir une base v6.
4. Rechargez le lien **sur la même origine et dans le même profil navigateur**, sans vider le stockage local. Les places et les liens sont conservés. En partant de v1, les anciens sièges prêts doivent choisir une faction puis se redéclarer prêts (migration #5) ; en partant de v2, factions et statuts sont conservés. L'hôte désigne J1 explicitement dans les deux cas. À partir de v3, une désignation valide est conservée. Aucun salon ouvert, même prêt, n'est lancé automatiquement.

Une préparation v4 déjà lancée et sans progression reçoit ses cinq placements lors de l'étape v4 → v5 si l'affectation manque. À l'étape v5 → v6, une préparation initiale à deux reçoit un unique tirage de Quête sans remélanger ses marqueurs. Aucun tirage de Quête en migration pour les salons ouverts ou les préparations à 3–5. Les identifiants, sessions, reçus, révisions et journal des salons lancés sont inchangés ; un snapshot incohérent annule la migration. Une fois le résultat sauvegardé, les reprises et redémarrages n'effectuent aucun tirage.

## Vérifier

```sh
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
```

[Architecture](docs/architecture.md) · [Décisions](docs/decisions.md) · [Couverture des règles](docs/rules-coverage.md)
