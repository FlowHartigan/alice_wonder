# Architecture

- **`apps/web`** : Vite et React affichent les vues reçues et émettent des intentions. Le futur plateau Phaser rendra la même vue, sans état de règles parallèle.
- **`apps/server`** : Node.js et Socket.IO attachent chaque connexion à une place et valident les messages avec Zod. Le serveur déduit l'acteur de la session, applique une transition pure, sauvegarde, puis publie une projection par destinataire. En développement Vite relaie `/socket.io` ; le prototype compilé utilise une origine commune.
- **`packages/game-engine`** : création du salon, admission, validation de la révision et changement de statut. Les règles de partie seront ajoutées ici par identifiant `WW-…`, avec des entrées aléatoires injectées pour les tests.
- **`packages/shared`** : schémas des messages et snapshots, contrats Socket.IO et types des vues. Le snapshot stocké et la réponse réseau sont distincts ; des vues publiques et privées seront séparées à l'arrivée des mains, sacs et objectifs.

### Salon et reprise

Le code sert à trouver le salon. Créer ou rejoindre attribue une place et un secret aléatoire transmis uniquement au navigateur qui l'a obtenue ; la base n'en garde qu'une empreinte. Le navigateur conserve le secret par salon, sur la même origine. Reconnexion et rechargement récupèrent la vue courante en présentant ce secret. L'URL contient seulement le code.

Pour `set-ready`, l'identifiant d'action, sa révision attendue et le statut demandé sont envoyés au serveur. Il ignore un rejeu identique et refuse un identifiant réutilisé pour une autre intention. Une action périmée qui changerait l'état est refusée ; demander un statut déjà atteint ne change ni la révision ni le journal. L'enregistrement du snapshot et celui de l'action sont atomiques. Le journal visible conserve les 40 derniers événements.

### Déploiement cible

Processus Node persistant compatible WebSocket, HTTPS et PostgreSQL avec migrations. Le prototype local utilise SQLite et un seul processus. Pour un service exposé, prévoir stockage persistant, politique d'expiration et de rotation des sessions, quotas et limitation des demandes. En cas de plusieurs instances, utiliser un adaptateur Socket.IO commun et une stratégie de transactions par salon avant d'activer la répartition.
