import { useEffect, useRef } from 'react';
import type { InitialQuestView, QuestTextView } from '@wonderland/shared';

function QuestText({ card, titleId }: { card: QuestTextView; titleId: string }) {
  return <>
    <h4 id={titleId}>{card.title}</h4>
    <dl>
      <dt>Exploit — {card.regionName}</dt><dd>{card.exploit}</dd>
      <dt>Objectif</dt><dd>{card.objective}</dd>
    </dl>
    {card.toConfirm && <p><strong>À confirmer :</strong> {card.toConfirm}</p>}
  </>;
}

export function InitialQuest({ quest, disabled, choose }: {
  quest: InitialQuestView; disabled: boolean; choose: (optionId: string) => void;
}) {
  const status = useRef<HTMLParagraphElement>(null);
  const choosingHere = useRef(false);
  useEffect(() => {
    if (quest.type === 'kept' && choosingHere.current) status.current?.focus();
  }, [quest.type]);
  return <section aria-labelledby="initial-quest-title" aria-describedby="initial-quest-source">
    <h3 id="initial-quest-title">Votre Quête initiale (étape J)</h3>
    <p id="initial-quest-source">Textes français non officiels, reformulés d’après le relevé anglais de Tabletop Simulator. Les critères ne sont pas évalués ici.</p>
    <p role="status" ref={status} tabIndex={-1}>{quest.type === 'kept'
      ? 'Choix enregistré. Votre Quête reste face cachée dans votre journal privé.'
      : 'Ces deux propositions sont privées. Gardez-en une : le choix est définitif et l’autre carte retourne dans la pioche, aussitôt remélangée.'}</p>
    <div className="resources-grid">
      {quest.type === 'kept' ? <article aria-labelledby="quest-kept-title">
        <QuestText card={quest.card} titleId="quest-kept-title" />
      </article> : quest.cards.map((card, i) => <article key={card.optionId} aria-labelledby={`quest-offer-${i}`}>
        <QuestText card={card} titleId={`quest-offer-${i}`} />
        <button type="button" disabled={disabled} onClick={() => {
          choosingHere.current = true;
          choose(card.optionId);
        }}>Garder « {card.title} »</button>
      </article>)}
    </div>
  </section>;
}
