import { useState } from 'react';
import { ALLY_SERIES, allySeriesLetter } from '@wonderland/shared';
import type { AllySeries, LobbyView } from '@wonderland/shared';

function SeriesForm({ current, disabled, choose }: {
  current: AllySeries | null; disabled: boolean; choose: (letter: AllySeries) => void;
}) {
  const [draft, setDraft] = useState<AllySeries | null>(current);
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (!disabled && draft !== null && draft !== current) choose(draft);
  }}>
    <p id="ally-series-agreement">Après accord de la table, saisissez la série retenue. Le choix est facultatif pour ce lancement.</p>
    <label>Série retenue <select value={draft ?? ''} disabled={disabled} aria-describedby="ally-series-agreement"
      onChange={(event) => {
        const letter = allySeriesLetter.safeParse(event.target.value);
        if (letter.success) setDraft(letter.data);
      }}>
      <option value="" disabled>Choisir une série</option>
      {ALLY_SERIES.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
    </select></label>
    <button type="submit" disabled={disabled || draft === null || draft === current}>Confirmer la série</button>
  </form>;
}

export function AllySeriesChoice({ view, disabled, choose }: {
  view: LobbyView; disabled: boolean; choose: (letter: AllySeries) => void;
}) {
  const Title = view.preparation ? 'h3' : 'h2';
  return <section className="panel" aria-labelledby="ally-series">
    <Title id="ally-series">Série des Alliés</Title>
    <p role="status">{view.allySeries === null ? 'Série non choisie' : `Série choisie : ${view.allySeries}`}</p>
    {view.canSelectAllySeries ? <SeriesForm key={view.allySeries} current={view.allySeries} disabled={disabled} choose={choose} />
      : <p>{view.preparation ? 'Le choix est figé depuis le lancement.' : 'Seul l’hôte peut saisir le choix de la table.'}</p>}
    <p><a href="https://luckyduckgames.com/france/index.php?controller=attachment&id_attachment=1416#page=9">
      Tableau des Alliés A–D (livret officiel FR, p. 9)</a> — consultation uniquement, sans installation ni activation des cartes.</p>
  </section>;
}
