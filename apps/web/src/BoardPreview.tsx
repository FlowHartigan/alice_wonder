import { useState } from 'react';
import type { RegionScoresSetupView, TeaTableSetupView, TwoPlayerSetupView } from '@wonderland/shared';
import board from '../../../assets/official/plateau-principal-fr.webp';

const blockerLabels = new Intl.ListFormat('fr', { type: 'conjunction' });

export function BoardPreview({ teaTable: { openChairs, activeBlockers }, regionScores, twoPlayerSetup }: {
  teaTable: TeaTableSetupView;
  regionScores: RegionScoresSetupView;
  twoPlayerSetup: TwoPlayerSetupView | null;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const blocked = activeBlockers.length === 0 ? 'Aucune chaise bloquée.'
    : activeBlockers.length === 1 ? `Chaise ${activeBlockers[0]} bloquée.`
      : `Chaises ${blockerLabels.format(activeBlockers)} bloquées.`;

  return <section className="board-preview" aria-labelledby="board-preview-title">
    <h3 id="board-preview-title">Aperçu du plateau — lecture seule</h3>
    <p id="tea-table-summary"><strong>Table du Thé :</strong> {openChairs} chaises ouvertes. {blocked} Aucune carte n’est installée.</p>
    {twoPlayerSetup && <p id="region-removal-summary">
      <strong>Quête révélée :</strong> {twoPlayerSetup.revealedQuestTitle}.{' '}
      <strong>Région hors jeu :</strong> {twoPlayerSetup.excludedRegion.name}.
    </p>}
    <div className="board-preview-image">
      <img src={board} width={2400} height={1637} alt="Plateau central officiel en français, avec la table du Thé au centre."
        aria-describedby={twoPlayerSetup ? 'tea-table-summary region-removal-summary' : 'tea-table-summary'}
        draggable={false} onLoad={() => setImageLoaded(true)} />
      {imageLoaded && activeBlockers.map((id) => <span key={id} className="board-blocker" data-chair={id} aria-hidden="true">{id}</span>)}
      {imageLoaded && regionScores.placements.map(({ regionId, pointsByRound: pv }) => (
        <span key={regionId} className="board-score-marker" data-region={regionId} aria-hidden="true">
          {pv[1]}/{pv[2]}/{pv[3]}
        </span>
      ))}
      {imageLoaded && twoPlayerSetup && <span className="board-region-excluded"
        data-region={twoPlayerSetup.excludedRegion.id} aria-hidden="true">Hors jeu</span>}
    </div>
    <p className="board-credit">Plateau : Druid City Games · édition française : Lucky Duck Games.</p>
    <table className="board-scores" tabIndex={0}>
      <caption>Marqueurs Score de Région — attribution initiale</caption>
      <thead><tr>
        <th scope="col">Région</th><th scope="col">PV round I</th><th scope="col">PV round II</th><th scope="col">PV round III</th>
      </tr></thead>
      <tbody>{regionScores.placements.map(({ regionId, regionName, pointsByRound: pv }) => (
        <tr key={regionId}><th scope="row">{regionName}</th><td>{pv[1]}</td><td>{pv[2]}</td><td>{pv[3]}</td></tr>
      ))}</tbody>
    </table>
  </section>;
}
