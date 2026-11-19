# Mémo technique — Wonderland’s War Web

À consulter avant de commencer une issue ou de retenter une commande qui a échoué. Pour chaque nouveau problème utile à retenir, noter le symptôme, la cause si elle est connue, la correction et la vérification. Signaler explicitement les blocages encore ouverts.

## Problèmes rencontrés

| Symptôme | Correction ou précaution | Vérification |
|---|---|---|
| Les instructions mentionnaient GitLab alors que le projet est sur GitHub. | Vérifier `git remote -v` avant toute écriture distante. Utiliser `gh` avec `--repo FlowHartigan/alice_wonder` lorsque la commande le permet. | `origin` et `gh repo view` ont confirmé le même dépôt. |
| Git indique `No commits yet` et `origin/main [gone]`. | Vérifier les branches réellement publiées avec `git ls-remote --heads origin`. Les issues peuvent être créées sans branche, mais une PR attend une base publiée. La mise en ligne du socle est suivie dans [#1](https://github.com/FlowHartigan/alice_wonder/issues/1). | **Ouvert :** au dernier contrôle, aucune branche distante n’existait. |
| L’appel `task` a renvoyé `Unknown agent type: github-issue`, alors que l’agent est configuré. | Distinguer les agents reconnus par OpenCode des types exposés par l’outil `task` de la session. Redémarrer OpenCode après modification de `.opencode/`. Si le type nommé est toujours indisponible, déléguer à un type disponible avec le rôle du fichier agent explicite et ne pas présenter ce relais comme un appel natif. | `opencode.cmd agent list` reconnaît les trois agents ; le relais `general` a permis de créer et de vérifier le backlog. |
| Une session en mode Plan ne permettait pas d’appliquer les fichiers. | Passer en mode **Build** avant d’écrire (`Tab` dans le terminal OpenCode) et vérifier le mode affiché. | Les fichiers d’agents et la commande `/evolution` ont ensuite été chargés par OpenCode. |
| Le téléchargement du livret FR via `webfetch` dépassait la limite de 5 Mo ; la commande `python` ouvrait le raccourci Microsoft Store. | Télécharger uniquement le PDF officiel dans le dossier temporaire approuvé avec `curl.exe`, puis extraire le texte avec `pdfjs-dist` sous Node. Pour les tableaux en pictogrammes, consulter la page rendue : l’extraction de texte ne suffit pas. | Les 24 pages ont été lues sous Node. Le tableau des Éclats de départ p. 5 reste à vérifier visuellement dans [#2](https://github.com/FlowHartigan/alice_wonder/issues/2). |
| Docker n’était pas disponible dans le `PATH` pendant le prototype. | Pour la recette locale, utiliser SQLite via `node:sqlite` et la version Node du projet (`>=24`). Voir `docs/decisions.md` pour la cible PostgreSQL. | Le test de réouverture de la base a retrouvé la place, le statut et l’idempotence. |
| TypeScript signalait `TS7053` après `socket.timeout(...).emitWithAck(...)` : la réponse devenait `any`. | Pour les appels à délai commun, régler `ackTimeout` dans les options de `io(...)` et appeler `socket.emitWithAck(...)` directement pour conserver le type de réponse. | `npm.cmd run build` est passé après la correction. |
| Les tests Socket.IO tournaient, mais `tsc` rejetait `node:events.once(socket, ...)` avec `TS2769`. | Pour un client Socket.IO, envelopper `socket.once(...)` dans une promesse typée et traiter `connect_error`. Garder `node:events.once` pour les vrais `EventEmitter`, par exemple le serveur HTTP. | Les tests Vitest, la compilation et le parcours Playwright sont passés après la correction. |

## À garder en tête pour la suite

- Sous PowerShell, utiliser `npm.cmd` ou `opencode.cmd` si l’exécution des scripts `.ps1` est bloquée. Pour le test entre navigateurs, installer Chromium et Firefox via `npx.cmd playwright install chromium firefox`, puis compiler avant `npm.cmd run test:e2e` : le test sert les fichiers compilés.
- L’édition **Lucky Duck Games FR `LKY WWR-R01-FR`** et la désignation du premier joueur par l’hôte après accord de la table ont déjà été confirmées. Reporter ces décisions dans `rules.md` lors de [#2](https://github.com/FlowHartigan/alice_wonder/issues/2) ; vérifier séparément le tirage, les errata et les données chiffrées encore incertaines.
