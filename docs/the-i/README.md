# Thé I — relevé documentaire

**Référence documentaire non exécutable, non validée pour l’édition FR.** Le relevé décrit le paquet photographié, pas la composition d’un paquet français. Édition matérielle, tirage, errata et conformité des effets restent à confirmer. Aucun statut de [`rules.md`](../../rules.md) ne change (`WW-CARD-001`, `WW-CARD-002`, `WW-TEA-002`, `WW-COUNT-001`).

- [`the-i.json`](the-i.json) distingue les **30 exemplaires** répartis sur trois rangées de dix et leurs **29 définitions**. Les positions sont celles de la photo BoardGameGeek. Les définitions résument les pictogrammes : `commun` distingue les effets communs des zones `haut` et `bas` d’un recto divisé et de la zone liée au dé (`siDeAccepte`) sur un recto corrompu. L’ordre des entrées n’est pas une consigne de résolution.
- [`visuels.json`](visuels.json) relie les identifiants visuels à la photo, au livret FR ou au module communautaire Tabletop Simulator (TTS). `rectoReference` désigne un support de lecture, pas nécessairement un visuel du même exemplaire physique. `pageExempleLivretFr` renvoie à `livret-fr` ; le dos partagé est celui du module TTS, pas un dos FR vérifié. Les URL identifient les sources publiques, pas les fichiers des recadrages ou des rendus exclus.

## Comparaison du paquet photographié avec le module TTS

Les effets relevés concordent pour 28 exemplaires. En rangée 3, colonnes 3 et 4, les deux exemplaires partagent la définition `the-i-29420`. Les rectos TTS `29420` et `29423` correspondent tous deux à ces effets, sans attribution certaine d’un numéro à une position précise.

| Position sur la photo | Effets communs relevés | Effet associé au dé Éclat |
|---|---|---|
| Rangée 1, colonne 10 (rapprochement avec l’exemple du livret FR p. 9) | 1 unité et accès au marché | 1 Allié faible au choix |
| Rangée 2, colonne 10 (lecture de la photo) | 2 unités et déblocage d’une capacité | Groupe supplémentaire de 2 unités |

Ces deux cartes corrompues n’ont pas d’équivalent exact dans le module. De son côté, le module contient deux variantes sans équivalent exact sur la photo : `29427` associe au dé un groupe de 3 unités, et `29428` conserve l’Allié lié au dé mais présente un déblocage de capacité dans les effets communs. Elles sont documentées séparément, sans les attribuer aux deux positions ni les compter dans le paquet photographié. La carte corrompue `29429`, elle, concorde.

## Limites de publication

L’export ne contient ni média, ni galerie, ni transcription de texte éditeur. Les métadonnées de provenance ne constituent pas une autorisation de publier ou d’intégrer les visuels. Les droits restent suivis dans [#36](https://github.com/FlowHartigan/alice_wonder/issues/36), et le futur catalogue FR utilisable par le moteur dans [#9](https://github.com/FlowHartigan/alice_wonder/issues/9). Aucun des deux chantiers n’est clos par [#37](https://github.com/FlowHartigan/alice_wonder/issues/37).
