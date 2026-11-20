# Thé I — relevé documentaire

**Dossier documentaire non exécutable.** Le relevé de [#37](https://github.com/FlowHartigan/alice_wonder/issues/37) décrit le paquet photographié. L’inventaire de [#83](https://github.com/FlowHartigan/alice_wonder/issues/83) décrit des illustrations du livret français. Ni l’un ni l’autre n’établit la composition d’un paquet FR ou ne valide les règles d’effets (`WW-CARD-001`, `WW-CARD-002`, `WW-TEA-002`). Le raccord de préparation (`WW-SETUP-004`, `WW-COUNT-001`) est dans [`rules.md`](../../rules.md#ww-setup-004--plateau-et-réserves-communes).

- [`the-i.json`](the-i.json) distingue les **30 exemplaires** répartis sur trois rangées de dix et leurs **29 définitions**. Les positions sont celles de la photo BoardGameGeek. Les définitions résument les pictogrammes : `commun` distingue les effets communs des zones `haut` et `bas` d’un recto divisé et de la zone liée au dé (`siDeAccepte`) sur un recto corrompu. L’ordre des entrées n’est pas une consigne de résolution.
- [`visuels.json`](visuels.json) relie les identifiants visuels à la photo, au livret FR ou au module communautaire Tabletop Simulator (TTS). `rectoReference` désigne un support de lecture, pas nécessairement un visuel du même exemplaire physique. `pageExempleLivretFr` renvoie à `livret-fr` ; le dos partagé est celui du module TTS, pas un dos FR vérifié. Les URL identifient les sources publiques, pas les fichiers des recadrages ou des rendus exclus.
- [`livret-fr.json`](livret-fr.json) relie chaque motif complet lu dans le livret à la définition #37 par `definition` (ID, pas la position ni le numéro TTS). Le lien donne `type` et les groupes `commun`, `haut`/`bas` ou `siDeAccepte` sans recopier leurs valeurs. Pour retrouver chaque aperçu, prendre l’URL de la source `livret-fr` dans `visuels.json`, ajouter `#page=` suivi du numéro et lire le `repere`. Avec `visuel`, le même exemple est aussi indexé par son ID dans `ressources`.
- [Protocole et gabarit de relevé 30/30](releve-fr.md) : comparer les cartes d’une seule boîte FR ou obtenir un inventaire éditeur équivalent. Le gabarit est vide de toute observation et le test de qualité est indépendant de l’application.

## Ce que le livret FR atteste

La [fiche éditeur](https://luckyduckgames.com/france/game/710-wonderland-s-war) et le [livret p. 3](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416#page=3) cadrent le jeu de base Lucky Duck Games `LKY WWR-R01-FR`. La p. 3 indique 90 cartes Thé, soit trois paquets de 30. La recherche n’a trouvé ni inventaire complet de Thé I FR ni erratum applicable à ces rectos ; le tirage matériel n’est pas identifié.

Une concordance `exacte` porte sur tous les groupes lus sur un **recto illustré**, pas sur la présence ou le nombre de copies dans une boîte. `recto-lisible` désigne un exemple isolé ou agrandi ; `recto-lisible-en-scene`, une lecture dans une scène de plateau. Plusieurs vues du même motif sont des occurrences d’illustrations, pas des exemplaires physiques. La p. 8 sert de légende de lecture, pas d’inventaire de rectos.

Les vues partielles ou incertaines ont seulement des `groupesVisibles` : un groupe omis n’est pas réputé absent du recto. `definitionComparee` pointe vers une comparaison, pas une identification. Celle-ci peut être `partielle` (indices concordants), `absente` (les pictogrammes visibles excluent une concordance exacte avec #37) ou `indeterminee` (lecture insuffisante pour conclure). En particulier, l’angle du recto Flamant/Quête est couvert p. 11 : ses pictogrammes visibles concordent, mais cette vue ne compte pas comme recto complet.

## Comparaison du paquet photographié avec le module TTS

Les effets relevés concordent pour 28 exemplaires. En rangée 3, colonnes 3 et 4, les deux exemplaires partagent la définition `the-i-29420`. Les rectos TTS `29420` et `29423` correspondent tous deux à ces effets, sans attribution certaine d’un numéro à une position précise.

| Position sur la photo | Effets communs relevés | Effet associé au dé Éclat |
|---|---|---|
| Rangée 1, colonne 10 (`the-i-bgg-l1c10`, motif attesté par le [recto p. 9](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416#page=9)) | 1 unité et accès au marché | 1 Allié faible au choix |
| Rangée 2, colonne 10 (`the-i-bgg-l2c10`, lecture de la photo ; non confirmé FR) | 2 unités et déblocage d’une capacité | Groupe supplémentaire de 2 unités |

Ces deux cartes corrompues n’ont pas d’équivalent exact dans le module. De son côté, le module contient deux variantes sans équivalent exact sur la photo : `29427` associe au dé un groupe de 3 unités, et `29428` conserve l’Allié lié au dé mais présente un déblocage de capacité dans les effets communs. Elles sont documentées séparément, sans les attribuer aux deux positions ni les compter dans le paquet photographié. La carte corrompue `29429`, elle, concorde.

Le [déballage FR du Dépuncheur vers 0:39](https://www.youtube.com/watch?v=NIie8RscLyU&t=39s) est au mieux un recoupement partiel de la première lecture, pas un relevé de boîte ni une identification de tirage. Ni la photo BGG (édition non attribuée au FR), ni le module communautaire EN, ni cette vidéo ne permettent d’inférer une quantité FR pour ces motifs ou de confirmer L2C10 en FR.

## Limites de publication

Le dossier ne contient ni média, ni galerie, ni transcription de texte éditeur. Les métadonnées de provenance ne constituent pas une autorisation de publier ou d’intégrer les visuels. Les droits restent suivis dans [#36](https://github.com/FlowHartigan/alice_wonder/issues/36), le futur catalogue FR utilisable par le moteur dans [#9](https://github.com/FlowHartigan/alice_wonder/issues/9) et la préparation commune dans [#12](https://github.com/FlowHartigan/alice_wonder/issues/12). Aucun de ces chantiers n’est clos par ce relevé.
