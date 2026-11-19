import { useState } from 'react';
import type { TeaTableSetupView } from '@wonderland/shared';
import board from '../../../assets/official/plateau-principal-fr.webp';

const blockerLabels = new Intl.ListFormat('fr', { type: 'conjunction' });

export function BoardPreview({ teaTable: { openChairs, activeBlockers } }: { teaTable: TeaTableSetupView }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const blocked = activeBlockers.length === 0 ? 'Aucune chaise bloquée.'
    : activeBlockers.length === 1 ? `Chaise ${activeBlockers[0]} bloquée.`
      : `Chaises ${blockerLabels.format(activeBlockers)} bloquées.`;

  return <section className="board-preview" aria-labelledby="board-preview-title">
    <h3 id="board-preview-title">Aperçu du plateau — lecture seule</h3>
    <p id="tea-table-summary"><strong>Table du Thé :</strong> {openChairs} chaises ouvertes. {blocked} Aucune carte n’est installée.</p>
    <div className="board-preview-image">
      <img src={board} width={2400} height={1637} alt="Plateau central officiel en français, avec la table du Thé au centre."
        aria-describedby="tea-table-summary" draggable={false} onLoad={() => setImageLoaded(true)} />
      {imageLoaded && activeBlockers.map((id) => <span key={id} className="board-blocker" data-chair={id} aria-hidden="true">{id}</span>)}
    </div>
    <p className="board-credit">Plateau : Druid City Games · édition française : Lucky Duck Games.</p>
  </section>;
}
