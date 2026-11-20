const rulebook = 'https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416';

/** WW-SETUP-003 L — reading aid, not a phase or Ally series configuration. */
export function SetupPhaseReference() {
  return <section className="panel setup-reference" aria-labelledby="setup-reference-title">
    <h3 id="setup-reference-title">Aide des phases</h3>
    <p>Ces repères ne remplacent pas le livret et ne lancent aucune phase.</p>
    <h4>Thé — <a href={`${rulebook}#page=7`}>livret FR, p. 7</a></h4>
    <p>Les Chefs font le tour de la table pour gagner des cartes Thé et appliquer leurs effets.
      En cours de déplacement, le passage en Bout de Table fait intervenir le dé Éclat et le réapprovisionnement des chaises vides non bloquées.
      Les Chefs rejoignent ensuite les Régions, après quatre cartes gagnées par joueur (cinq à deux joueurs).</p>
    <h4>Guerre — <a href={`${rulebook}#page=12`}>livret FR, p. 12</a></h4>
    <p>On parcourt les Régions à partir du marqueur Premier combat. Dans un combat avec pioche,
      les participants établissent leur Force de départ et tirent un premier jeton ensemble.
      La Folie peut coûter des unités ; si le combat continue, les joueurs encore en lice peuvent repiocher ou abandonner.</p>
    <p>À deux joueurs, la Région écartée est ignorée, la Résistance locale intervient même face à une seule faction et il n’y a pas de Paris.
      Voir les <a href={`${rulebook}#page=21`}>exceptions à deux joueurs (livret FR, p. 21)</a>.</p>
    <p><a href={`${rulebook}#page=9`}>Tableau des Alliés A–D (livret officiel FR, p. 9)</a> — consultation uniquement.
      Aucune série d’Alliés active n’est encore configurée.</p>
  </section>;
}
