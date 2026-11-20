import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { credentials, FACTION_NAMES, MAX_PLAYERS, MIN_PLAYERS, roomCode } from '@wonderland/shared';
import type { ClientEvents, ErrorCode, IndividualResourcesSetupView, InitialQuestView, LobbyAction, LobbyView, ServerEvents, Session } from '@wonderland/shared';
import { BoardPreview } from './BoardPreview.tsx';
import { InitialQuest } from './InitialQuest.tsx';
import { SetupPhaseReference } from './SetupPhaseReference.tsx';
import { mergeLobbyView } from './merge-lobby-view.ts';
import './styles.css';

const messages: Record<ErrorCode, string> = {
  invalid: 'Vérifiez le nom ou le code saisi.',
  'room-not-found': 'Aucun salon ne correspond à ce code.',
  'room-full': 'Le salon est complet.',
  'already-seated': 'Cette connexion est déjà associée à un joueur. Rechargez la page.',
  unauthorized: 'Votre place n’a pas pu être retrouvée dans ce navigateur.',
  conflict: 'Le salon a changé. Vérifiez les choix actuels, puis réessayez.',
  unavailable: 'Le serveur n’a pas pu terminer cette demande.',
  'faction-taken': 'Cette faction est déjà prise. Choisissez une faction disponible.',
  'faction-required': 'Choisissez une faction avant de vous déclarer prêt.',
  'host-required': 'Cette action est réservée à l’hôte.',
  'seat-not-found': 'Ce siège n’est pas dans le salon. Choisissez un siège présent.',
  'room-closed': 'La préparation a commencé. Le salon est fermé aux nouvelles admissions et sa configuration est figée.',
  'already-launched': 'La préparation a déjà été lancée.',
  'decision-unavailable': 'Ce choix de Quête n’est plus disponible.',
  'wrong-phase': 'Ce choix est réservé à la préparation de la partie.',
  'player-count': `Il faut entre ${MIN_PLAYERS} et ${MAX_PLAYERS} joueurs pour lancer la préparation.`,
  'factions-incomplete': 'Chaque joueur doit choisir une faction différente.',
  'players-not-ready': 'Tous les joueurs doivent confirmer qu’ils sont prêts.',
  'first-player-required': 'Désignez le premier joueur parmi les sièges du salon.',
};
const factionStatus = { available: 'Disponible', yours: 'Votre faction', taken: 'Prise' };
type LobbyIntent = { [T in LobbyAction['type']]: Omit<Extract<LobbyAction, { type: T }>, 'actionId' | 'expectedRevision'> }[LobbyAction['type']];
const storageKey = (code: string) => `ww:seat:${code}`;
const queryCode = new URLSearchParams(location.search).get('salon') ?? '';
const initialCode = roomCode.safeParse(queryCode);
const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false, ackTimeout: 5000 });

function readSession(): Session | undefined {
  if (!initialCode.success) return;
  try {
    const parsed = credentials.safeParse(JSON.parse(localStorage.getItem(storageKey(initialCode.data)) ?? 'null'));
    if (parsed.success && parsed.data.code === initialCode.data) return parsed.data;
  } catch { /* Browsers can disable storage. */ }
}

function actionId() {
  // getRandomValues also works on HTTP on a trusted local network.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function invitation(code: string) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('salon', code);
  return url.href;
}

function seatLabel(players: LobbyView['players'], index: number) {
  return `${players[index].name} (siège ${index + 1})`;
}

const boardFaceLabels = { ordinary: 'Face ordinaire', 'golden-two-player': 'Face dorée « 2 JOUEURS »' };
const shieldLabels = { intact: 'Intact' };

function IndividualResources({ players, resources }: { players: LobbyView['players']; resources: IndividualResourcesSetupView }) {
  return <section className="individual-resources" aria-labelledby="resources-title" aria-describedby="resources-note">
    <h3 id="resources-title">Dotation individuelle de départ</h3>
    <p id="resources-note">Ressources attribuées en préparation (étapes A à I), en lecture seule. Pour chaque sac, seul le nombre de jetons est visible.</p>
    <div className="resources-grid">
      {resources.map((seat) => {
        const titleId = `resources-${seat.playerId}`;
        return <article key={seat.playerId} aria-labelledby={titleId}>
          <h4 id={titleId}>{seatLabel(players, players.findIndex(({ id }) => id === seat.playerId))} — {FACTION_NAMES[seat.faction]}</h4>
          <dl>
            <dt>Plateau de faction</dt><dd>{boardFaceLabels[seat.boardFace]}</dd>
            <dt>Partisans en réserve</dt><dd>{seat.supportersInReserve}</dd>
            <dt>Partisans sur la troisième piste de Forge</dt><dd>{seat.supportersOnThirdForgeTrack}</dd>
            <dt>Châteaux en réserve</dt><dd>{seat.castlesInReserve}</dd>
            <dt>Artefacts sur la Forge</dt><dd>{seat.artifactsOnForge}</dd>
            <dt>Capacités couvertes</dt><dd>{seat.coveredAbilities}</dd>
            <dt>Force du Chef</dt><dd>{seat.leaderStrength}</dd>
            <dt>Bouclier</dt><dd>{shieldLabels[seat.shield]}</dd>
            <dt>Points de victoire (PV)</dt><dd>{seat.victoryPoints}</dd>
            <dt>Piste de Combat</dt><dd>{seat.combat}</dd>
            <dt>Jetons dans le sac</dt><dd>{seat.bagTokenCount}</dd>
            <dt>Jetons Poison en réserve</dt><dd>{seat.poisonInReserve}</dd>
            <dt>Jetons actifs</dt><dd>{seat.activeTokenCount}</dd>
            <dt>Jetons épuisés</dt><dd>{seat.exhaustedTokenCount}</dd>
            <dt>Jetons sur la piste de Folie</dt><dd>{seat.madnessTrackTokenCount}</dd>
          </dl>
        </article>;
      })}
    </div>
  </section>;
}

function journalEntry(item: LobbyView['journal'][number], players: LobbyView['players']) {
  if (item.type === 'factions-enabled') {
    const count = item.resetReadyCount;
    return <>Le choix de faction est disponible.{count === 1 ? ' Un siège est repassé non prêt.'
      : count > 1 ? ` ${count} sièges sont repassés non prêts.` : ''}</>;
  }
  if (item.type === 'first-player-cleared') {
    return 'Le siège désigné n’est plus dans le salon. Aucun premier joueur n’est désigné.';
  }
  const actor = players.find((p) => p.id === item.actorId)?.name ?? 'Un joueur';
  if (item.type === 'launch-preparation') return <><strong>{actor}</strong> a lancé la préparation.</>;
  if (item.type === 'select-faction') {
    const choice = item.previousFaction
      ? `a remplacé ${FACTION_NAMES[item.previousFaction]} par ${FACTION_NAMES[item.faction]}.`
      : `a choisi ${FACTION_NAMES[item.faction]}.`;
    return <><strong>{actor}</strong> {choice}{item.wasReady && ' Son siège est repassé non prêt.'}</>;
  }
  if (item.type === 'select-first-player') {
    const index = players.findIndex((p) => p.id === item.firstPlayerId);
    return <><strong>{actor}</strong> a désigné {index >= 0 ? seatLabel(players, index) : 'un siège depuis retiré'} pour commencer.</>;
  }
  const change = item.type === 'joined' ? 'a rejoint le salon.' : item.ready ? 'est prêt.' : 'a retiré son statut prêt.';
  return <><strong>{actor}</strong> {change}</>;
}

function App() {
  const session = useRef<Session | undefined>(readSession());
  const busy = useRef(false);
  const [view, setView] = useState<LobbyView>();
  const [connection, setConnection] = useState<'waiting' | 'online' | 'offline'>('waiting');
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode.success ? initialCode.data : queryCode);
  const [mode, setMode] = useState<'create' | 'join'>(queryCode ? 'join' : 'create');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const preparationTitle = useRef<HTMLHeadingElement>(null);
  const wasInLobby = useRef(false);
  const preparation = view?.preparation;
  const preparing = Boolean(preparation);

  function receive(next: LobbyView) {
    setView((previous) => mergeLobbyView(previous, next));
  }

  useEffect(() => {
    async function onConnect() {
      const connectionId = socket.id;
      setError('');
      if (session.current) {
        setConnection('waiting');
        try {
          const reply = await socket.emitWithAck('lobby:resume', session.current);
          if (!socket.connected || socket.id !== connectionId) return;
          if (reply.ok) receive(reply.value);
          else {
            if (reply.error !== 'unauthorized') {
              setError(messages[reply.error]);
              setConnection('offline');
              return;
            }
            try { localStorage.removeItem(storageKey(session.current.code)); } catch { /* storage unavailable */ }
            session.current = undefined;
            setView(undefined);
            setError(messages.unauthorized);
          }
        } catch {
          if (!socket.connected || socket.id !== connectionId) return;
          setError('La reprise a expiré. Rechargez la page pour réessayer.');
          setConnection('offline');
          return;
        }
      }
      setConnection('online');
    }
    const onDisconnect = () => setConnection('offline');
    const onUpdate = (next: LobbyView) => {
      if (session.current?.code === next.code) receive(next);
    };
    const onQuestUpdate = (next: InitialQuestView) => setView((previous) => {
      const current = previous?.preparation;
      if (!previous || !current || current.gameId !== next.gameId || current.initialQuest.revision >= next.revision) return previous;
      return { ...previous, preparation: { ...current, initialQuest: next } };
    });
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('lobby:update', onUpdate);
    socket.on('setup-quest:update', onQuestUpdate);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('lobby:update', onUpdate);
      socket.off('setup-quest:update', onQuestUpdate);
      socket.disconnect();
    };
  }, []);

  const inLobby = Boolean(view) && !preparing;
  useEffect(() => {
    if (wasInLobby.current && preparing) preparationTitle.current?.focus();
    wasInLobby.current = inLobby;
  }, [inLobby, preparing]);

  async function request(work: () => Promise<void>) {
    if (busy.current || !socket.connected || connection !== 'online') return;
    busy.current = true;
    setPending(true);
    setError('');
    try { await work(); }
    catch { setError('Aucune réponse du serveur. Vérifiez la connexion et l’état du salon.'); }
    finally { busy.current = false; setPending(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void request(async () => {
      const reply = mode === 'create'
        ? await socket.emitWithAck('lobby:create', { name })
        : await socket.emitWithAck('lobby:join', { name, code });
      if (!reply.ok) return setError(messages[reply.error]);
      const admission = reply.value;
      session.current = admission.session;
      history.replaceState(null, '', invitation(admission.session.code));
      try { localStorage.setItem(storageKey(admission.session.code), JSON.stringify(admission.session)); }
      catch { setNotice('Le stockage du navigateur est indisponible : gardez cette page ouverte pour conserver votre place.'); }
      receive(admission.view);
    });
  }

  const me = view?.players.find((player) => player.id === view.you);
  const firstPlayerIndex = view?.players.findIndex(({ id }) => id === view.firstPlayerId) ?? -1;
  function sendAction(intent: LobbyIntent, expectedRevision: number) {
    void request(async () => {
      const reply = await socket.emitWithAck('lobby:action', {
        ...intent, actionId: actionId(), expectedRevision,
      });
      if (!reply.ok) return setError(reply.error === 'invalid' ? 'Cette action n’est pas reconnue par le serveur.' : messages[reply.error]);
      receive(reply.value);
    });
  }

  function chooseQuest(optionId: string) {
    const quest = preparation?.initialQuest;
    if (quest?.type !== 'offer') return;
    void request(async () => {
      const reply = await socket.emitWithAck('setup-quest:choose', {
        type: 'submit-decision', actionId: actionId(), expectedRevision: quest.revision,
        params: { decisionId: quest.decisionId, optionId },
      });
      if (!reply.ok) setError(reply.error === 'invalid' ? 'Cette Quête ne fait pas partie de vos propositions.' : messages[reply.error]);
    });
  }

  const disabled = pending || connection !== 'online';
  const blockers = view?.launch?.blockers;
  const connectionLabel = { waiting: 'Connexion en cours', online: 'Connecté', offline: 'Déconnecté' }[connection];
  return <main>
    <header className="hero">
      <div className="eyebrow">Salon privé · Démonstration multijoueur</div>
      <h1>Wonderland’s War</h1>
      <p>Invitez jusqu’à quatre personnes et retrouvez votre place après avoir rechargé la page.</p>
      <p className="connection" data-online={connection === 'online'} role="status">{connectionLabel}</p>
    </header>

    {error && <p className="feedback" role="alert">{error}</p>}
    {notice && <p className="feedback" role="status">{notice}</p>}

    {!view ? <section className="panel entry" aria-labelledby="entry">
      <h2 id="entry">{mode === 'create' ? 'Créer un salon' : 'Rejoindre un salon'}</h2>
      <form onSubmit={submit}>
        <label>Votre nom <input required maxLength={30} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" /></label>
        {mode === 'join' && <label>Code du salon <input required maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" spellCheck={false} /></label>}
        <div className="controls">
          <button disabled={disabled}>{mode === 'create' ? 'Créer le salon' : 'Rejoindre le salon'}</button>
          <button className="secondary" type="button" disabled={pending} onClick={() => { setError(''); setMode(mode === 'create' ? 'join' : 'create'); }}>
            {mode === 'create' ? 'J’ai un code' : 'Créer un autre salon'}
          </button>
        </div>
      </form>
    </section> : <div className="lobby">
      {preparation ? <section className="panel preparation" aria-labelledby="preparation">
        <h2 id="preparation" ref={preparationTitle} tabIndex={-1}>Préparation de la partie</h2>
        <p><strong>Admissions fermées.</strong> Les sièges et la configuration sont figés. Les joueurs déjà admis peuvent reprendre leur place avec ce même lien.</p>
        <p>Salon <strong>{view.code}</strong> · {view.players.length} joueurs</p>
        <ul className="players" aria-label="Sièges et factions de la préparation">
          {view.players.map((p, index) => <li key={p.id}>
            <span><strong>{seatLabel(view.players, index)}</strong>{p.id === view.hostId && <small>Hôte</small>}{p.id === view.you && <small>Vous</small>}
              <span className="player-faction">{p.faction && FACTION_NAMES[p.faction]}</span>
            </span>
            {p.id === view.firstPlayerId && <span className="badge">Premier joueur (J1)</span>}
          </li>)}
        </ul>
        <p id="first-tea-note">Les Éclats de départ sont prévus, pas encore crédités. Le premier Thé n’a pas commencé.</p>
        <table className="first-tea-preview" aria-describedby="first-tea-note">
          <caption>Aperçu — ordre prévu du premier Thé et Éclats de départ</caption>
          <thead><tr><th scope="col">Rang</th><th scope="col">Joueur</th><th scope="col">Éclats prévus</th></tr></thead>
          <tbody>{preparation.firstTeaPreview.map(({ playerId, turn, plannedShards }) => <tr key={playerId}>
            <th scope="row">J{turn}</th>
            <td>{seatLabel(view.players, view.players.findIndex(({ id }) => id === playerId))}</td>
            <td>{plannedShards}</td>
          </tr>)}</tbody>
        </table>
        <InitialQuest quest={preparation.initialQuest} disabled={disabled} choose={chooseQuest} />
        <div aria-live="polite">
          {preparation.initialBets !== null && <section className="panel" aria-labelledby="initial-bets">
            <h3 id="initial-bets">Vos cartes Pari</h3>
            {preparation.initialBets.length === 0 ? <p>Aucune carte Pari à deux joueurs.</p>
              : <ul>{preparation.initialBets.map((faction) => <li key={faction}>{FACTION_NAMES[faction]}</li>)}</ul>}
            <p>Les Paris ne se jouent pas pendant la préparation.</p>
          </section>}
        </div>
        {preparation.initialBets !== null && <SetupPhaseReference />}
        <IndividualResources players={view.players} resources={preparation.individualResources} />
        <BoardPreview teaTable={preparation.teaTable} regionScores={preparation.regionScores}
          twoPlayerSetup={preparation.twoPlayerSetup} firstBattle={preparation.firstBattle}
          initialLeaders={preparation.initialLeaders} players={view.players} />
      </section> : <>
      <section className="panel" aria-labelledby="players">
        <div className="section-title"><h2 id="players">Joueurs</h2><span>{view.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="players">
          {view.players.map((p) => <li key={p.id}>
            <span><strong>{p.name}</strong>{p.id === view.hostId && <small>Hôte</small>}{p.id === view.you && <small>Vous</small>}
              <span className="player-faction">{p.faction ? FACTION_NAMES[p.faction] : 'Sans faction'}</span>
            </span>
            <span className="badge" data-ready={p.ready}>{p.ready ? 'Prêt' : 'En attente'}</span>
          </li>)}
        </ul>
      </section>

      <section className="panel" aria-labelledby="invite">
        <h2 id="invite">Invitation</h2>
        <p className="code">{view.code}</p>
        <label>Lien du salon <input readOnly value={invitation(view.code)} onFocus={(e) => e.target.select()} /></label>
        {navigator.clipboard && <button className="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(invitation(view.code)); setNotice('Lien copié.'); }
          catch { setNotice('Sélectionnez le lien ci-dessus pour le copier.'); }
        }}>Copier le lien</button>}
      </section>

      <section className="panel" aria-labelledby="factions">
        <h2 id="factions">Votre faction</h2>
        <p>Choisissez une faction pour vous déclarer prêt. Si vous en changez, vous devrez confirmer à nouveau votre statut.</p>
        <ul className="factions" aria-live="polite">
          {view.factions.map(({ id, status }) => {
            const blocked = disabled || status === 'taken';
            return <li key={id}>
              <button type="button" className="secondary" aria-pressed={status === 'yours'}
                aria-describedby={`status-${id}`} aria-disabled={blocked}
                onClick={() => { if (!blocked) sendAction({ type: 'select-faction', faction: id }, view.revision); }}>
                {FACTION_NAMES[id]}
              </button>
              <span className="badge" id={`status-${id}`}>{factionStatus[status]}</span>
            </li>;
          })}
        </ul>
        {me && <button disabled={disabled || !view.canSetReady}
          onClick={() => sendAction({ type: 'set-ready', ready: !me.ready }, view.revision)}>
          {me.ready ? 'Retirer mon statut prêt' : 'Je suis prêt'}
        </button>}
      </section>

      <section className="panel first-player" aria-labelledby="first-player">
        <h2 id="first-player">Premier joueur</h2>
        <p id="tea-criterion">La personne qui a bu du thé le plus récemment commence.</p>
        <p role="status">{firstPlayerIndex >= 0
          ? <>Premier joueur désigné : <strong>{seatLabel(view.players, firstPlayerIndex)}</strong>.</>
          : 'Aucun premier joueur désigné.'}</p>
        {view.canSelectFirstPlayer ? <>
          <p id="first-player-choice">Selon l’accord de la table, choisissez le siège qui commencera.</p>
          <div className="controls" role="group" aria-labelledby="first-player-choice" aria-describedby="tea-criterion">
            {view.players.map(({ id }, index) => <button key={id} type="button" className="secondary"
              aria-pressed={id === view.firstPlayerId} aria-disabled={disabled}
              onClick={() => { if (!disabled) sendAction({ type: 'select-first-player', firstPlayerId: id }, view.revision); }}>
              {seatLabel(view.players, index)}
            </button>)}
          </div>
        </> : <p>Seul l’hôte peut désigner le premier joueur.</p>}
      </section>

      {blockers && <section className="panel launch" aria-labelledby="launch">
        <h2 id="launch">Lancement</h2>
        <div id="launch-conditions" aria-live="polite">
          {blockers.length > 0 ? <ul>{blockers.map((reason) => <li key={reason}>{messages[reason]}</li>)}</ul>
            : <p>Tout est prêt. Le lancement fermera les admissions et figera les choix.</p>}
        </div>
        <button type="button" disabled={disabled || blockers.length > 0} aria-describedby="launch-conditions"
          onClick={() => sendAction({ type: 'launch-preparation' }, view.revision)}>Lancer la préparation</button>
      </section>}
      </>}
      <section className="panel journal" aria-labelledby="journal">
        <h2 id="journal">Journal du salon</h2>
        <ol reversed tabIndex={0} aria-labelledby="journal">
          {view.journal.slice().reverse().map((item) => <li key={item.revision}>{journalEntry(item, view.players)}</li>)}
        </ol>
      </section>
    </div>}
    <footer>Prototype de salon · La partie de plateau n’est pas encore disponible.</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
