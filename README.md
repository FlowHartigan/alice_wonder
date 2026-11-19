# Wonderland’s War — salon web

Ce prototype permet de créer un salon privé, d'inviter jusqu'à quatre autres joueurs, de choisir une faction disponible et de partager les choix, le statut prêt et le journal en temps réel. L'hôte peut désigner le premier joueur selon le critère du thé, sans choix par défaut. Une place est retrouvée après rechargement ou coupure réseau. Le lancement et la partie de plateau ne sont pas encore disponibles.

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

SQLite enregistre l'état dans `.data/lobbies.sqlite` par défaut (dossier configurable avec `DATA_DIR`). Au redémarrage, ne changez pas l'adresse utilisée dans le navigateur ni le dossier de données pour reprendre le salon.

### Mettre à jour un salon existant (v1 ou v2 → v3)

1. Préparez le code mis à jour et compilez le client (`npm ci`, `npm run build`, Node.js ≥ 24) sans lancer un deuxième serveur sur la base active.
2. Lors d'une fenêtre de maintenance, arrêtez l'ancien serveur, puis faites une sauvegarde SQLite cohérente hors du dossier de données (conservez les éventuels fichiers `-wal` / `-shm` avec la base si vous faites une copie à froid). Ne supprimez pas la base existante.
3. Lancez `npm start` avec **le même dossier de données** (chemin absolu `DATA_DIR` si vous changez de checkout) et les mêmes paramètres réseau (`HOST`, `PORT`, `PUBLIC_ORIGIN` si défini). La migration se fait au démarrage. Pour revenir à une ancienne version, arrêtez le serveur v3 et restaurez la sauvegarde correspondante avec l'ancien code : v1 et v2 ne savent pas ouvrir une base v3.
4. Rechargez le lien d'invitation **sur la même origine et dans le même profil navigateur**, sans vider le stockage local. Les places et les liens sont conservés. En partant de v1, les anciens sièges prêts doivent choisir une faction puis se redéclarer prêts (migration #5) ; en partant de v2, factions et statuts sont conservés. L'hôte désigne J1 explicitement dans les deux cas.

## Vérifier

```sh
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
```

[Architecture](docs/architecture.md) · [Décisions](docs/decisions.md) · [Couverture des règles](docs/rules-coverage.md)
