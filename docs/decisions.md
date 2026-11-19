# Décisions

| Décision | Motif / suite |
|---|---|
| Jeu de base FR Lucky Duck Games `LKY WWR-R01-FR` comme référence confirmée | [#2](https://github.com/FlowHartigan/alice_wonder/issues/2). Le tirage de la boîte et la confrontation du livret au matériel restent à contrôler ; ni Deluxe EN, ni extensions, ni promos. Voir [`rules.md` §0](../rules.md#0-références-édition-et-méthode) pour les sources et la portée de la vérification des errata. |
| Au Thé du round I, l'hôte désigne le premier joueur selon l'accord de la table | Le critère du livret p. 5 est la consommation de thé la plus récente. La désignation par l'hôte est une décision produit confirmée, pas une règle de départage supplémentaire ni une fonctionnalité déjà implémentée. Voir [`WW-SETUP-005`](../rules.md#ww-setup-005--initiative-et-éclats-du-round-i). |
| Premier jalon : salon et statut prêt | Permet de tester synchronisation, validations et reprise sans inventer de mécanique de plateau. L'hôte est identifié ; sélection de faction et lancement viendront avec la préparation validée. |
| SQLite local en attendant PostgreSQL | Le pilote intégré à Node permet l'essai sans installateur de base ni Docker. Le stockage est isolé dans `apps/server/src/store.ts` ; `user_version` et le champ `version` des snapshots distinguent migration SQL et format métier. |
| Origine unique pour le parcours local | Fournir une URL simple aux participants. Même origine exigée pour les connexions navigateur ; `PUBLIC_ORIGIN` est disponible derrière un proxy. |
| Plateau central FR ajouté au dépôt, sans intégration à l'interface | Le WebP officiel est conservé dans `assets/official/` ; le salon reste en CSS et ne charge pas cette ressource. Voir [`LICENSES.md`](../LICENSES.md) pour la provenance et la portée de l'autorisation. |

Limites du prototype : la place persiste quand le navigateur se déconnecte ; suppression de place et archivage des salons viendront ensuite. Conserver l'origine et les données du navigateur pour reprendre une place. Si la première réponse à une création ou admission est perdue avant réception du secret, la place attribuée n'est pas récupérable ; cette opération n'est pas rejouée automatiquement.
