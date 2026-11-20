# Relevé physique Thé I — jeu de base FR

Pour [#83](https://github.com/FlowHartigan/alice_wonder/issues/83) (Refs [#9](https://github.com/FlowHartigan/alice_wonder/issues/9), [#12](https://github.com/FlowHartigan/alice_wonder/issues/12)), il reste à obtenir **les 30 rectos Thé I d'une seule boîte** du jeu de base Lucky Duck Games FR `LKY WWR-R01-FR`, avec sa référence et son tirage si lisible, ou un inventaire éditeur équivalent rattaché à l'édition et détaillant les 30 exemplaires. Le [livret FR p. 3](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416#page=3) donne le total (90, soit trois fois 30), pas les quantités par motif. Le [relevé #37](the-i.json) sert à comparer les motifs, pas à remplir les lignes ni à attribuer des quantités au paquet FR.

## Relever une boîte

1. Copier le [gabarit vierge](releve-fr.gabarit.json) hors du dépôt. Dans `boite`, donner un `id` stable et non identifiant pour la personne (un code local), la `reference` commerciale vérifiée sur le matériel (`LKY WWR-R01-FR`), et une `provenanceMaterielle` qui explique comment la boîte et ses cartes ont été identifiées et examinées. Dans `tirage`, noter le marquage de tirage qui est réellement lisible, ou laisser `null` s'il est absent ou illisible. Ne pas déduire le tirage de la référence commerciale. Ne pas mélanger différentes boîtes, les autres rounds, des extensions ou des promos.
2. Isoler le round I, disposer les cartes en ordre fixe (par exemple trois rangées de dix), puis relever **une ligne par carte distincte**, même si deux rectos portent le même motif. `position` (1 à 30) identifie l'exemplaire dans cette boîte, sans correspondre à une position BGG ou à un ordre de pioche. `preuve` est un repère unique et stable par carte : par exemple un identifiant de prise de vue avec sa rangée et sa colonne si plusieurs cartes y figurent. Garder les médias et le lien entre repère et preuve hors du dépôt ; ne pas inclure d'image, de lien privé, de chemin privé ni de texte éditeur brut dans la fiche.
3. Lire les icônes avant de comparer. `type` reprend `simple`, `divisee` ou `corrompue`. Dans `groupes`, décrire les effets par listes de chaînes courtes reformulées, selon [les groupes de #37](the-i.json) et les [explications du livret p. 8–9](https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416#page=8) :
   - `commun` pour les effets sans choix de branche (liste vide seulement si aucun effet commun n'est observé sur un motif lisible) ;
   - `haut` et `bas` pour les deux choix d'une carte divisée ;
   - `siDeAccepte` pour le dé et sa récompense liée sur une carte corrompue. Un dé indépendant du choix se relève dans `commun` ; ne pas fusionner deux icônes d'affectation en une seule quantité.
4. Remplir `comparaison` avec l'un de ces objets :

   | `statut` | Autres champs | Quand l'utiliser |
   | --- | --- | --- |
   | `exact` | `definition` : ID dans `definitions` de `the-i.json` | Toute la carte concorde, y compris type, nombres, niveau des Alliés et répartition des effets. Pour le contrôle, harmoniser les libellés avec #37 après lecture de la carte. |
   | `nouveau` | Facultatif : `ecart` avec `definition` (ID connu) et `description` (différence reformulée) | Recto entièrement lisible mais différent de toutes les définitions #37. Un écart ciblé indique le motif de référence et précise le groupe ou le type qui diffère. Ce n'est pas un rattachement à ce motif. |
   | `indecis` | `raison` : ce qui empêche de conclure | Carte présente avec preuve, mais lecture ou comparaison incertaine. Laisser `type` ou `groupes` à `null` si inconnus, ou saisir seulement les groupes lisibles (omettre les groupes illisibles). Aucun motif n'est confirmé ou déduit. |

Une carte physiquement manquante n'est **pas** un cas `indecis` : laisser la case sans observation et signaler le relevé incomplet. Ne jamais compenser une pièce manquante avec un exemple du livret, la photo BGG, le module TTS EN ou une carte d'une autre boîte. Un compte de zéro dans cette boîte ne démontre pas l'absence d'un motif dans l'ensemble des tirages FR.

## Contrôle local hors application

Depuis la racine, avec Vitest déjà installé (PowerShell ; remplacer le chemin par celui de la copie remplie) :

```powershell
$env:THE_I_RELEVE_FR = 'C:\chemin\vers\releve-fr.json'
try { npm.cmd test -- --no-cache tests/the-i-releve-fr.test.ts } finally { Remove-Item Env:THE_I_RELEVE_FR }
```

Sans `THE_I_RELEVE_FR`, Vitest vérifie le gabarit et des cas synthétiques, sans charger de relevé. Avec la variable, il vérifie en plus le fichier UTF-8 indiqué. Le contrôle exige 30 positions distinctes, une boîte renseignée et un repère de preuve distinct par exemplaire. Il vérifie la structure des groupes et les liens vers les définitions, puis affiche un bilan JSON : `total`, `positionsUniques`, `preuvesUniques`, `confirmesParMotif`, `nouveaux` (nombre d'exemplaires et comptes par motif), `indecis` (nombre et positions). Les motifs nouveaux sont regroupés par type et contenu des groupes ; la comparaison ignore l'ordre des libellés **dans** un groupe, pas la distinction entre les groupes ni les répétitions d'un libellé. Les comptes viennent des lignes, jamais de `occurrences` dans #37.

Un succès signifie **30/30 documentés mécaniquement**, pas 30 rectos identifiés si des lignes restent indécises. Le contrôle ne lit pas les photos, ne juge pas la provenance ni l'équivalence sémantique de deux libellés, et ne constitue ni preuve matérielle ni validation pour le moteur. Cette fiche et son test ne sont pas un format d'import de l'application.
