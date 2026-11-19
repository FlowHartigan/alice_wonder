import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { credentials, MAX_PLAYERS, roomCode } from '@wonderland/shared';
import type { ClientEvents, ErrorCode, LobbyView, ServerEvents, Session } from '@wonderland/shared';
import './styles.css';

const messages: Record<ErrorCode, string> = {
  invalid: 'Vérifiez le nom ou le code saisi.',
  'room-not-found': 'Aucun salon ne correspond à ce code.',
  'room-full': 'Le salon est complet.',
  'already-seated': 'Cette connexion est déjà associée à un joueur. Rechargez la page.',
  unauthorized: 'Votre place n’a pas pu être retrouvée dans ce navigateur.',
  conflict: 'Le salon a changé. Vérifiez votre statut et réessayez.',
  unavailable: 'Le serveur n’a pas pu terminer cette demande.',
};
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

  function receive(next: LobbyView) {
    setView((previous) => previous && previous.code === next.code && previous.revision > next.revision ? previous : next);
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
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('lobby:update', onUpdate);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('lobby:update', onUpdate);
      socket.disconnect();
    };
  }, []);

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
  function setReady(ready: boolean, expectedRevision: number) {
    void request(async () => {
      const reply = await socket.emitWithAck('lobby:action', {
        actionId: actionId(), type: 'set-ready', ready, expectedRevision,
      });
      if (!reply.ok) return setError(messages[reply.error]);
      receive(reply.value);
    });
  }

  const disabled = pending || connection !== 'online';
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
      <section className="panel" aria-labelledby="players">
        <div className="section-title"><h2 id="players">Joueurs</h2><span>{view.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="players">
          {view.players.map((p) => <li key={p.id}>
            <span><strong>{p.name}</strong>{p.id === view.hostId && <small>Hôte</small>}{p.id === view.you && <small>Vous</small>}</span>
            <span className="badge" data-ready={p.ready}>{p.ready ? 'Prêt' : 'En attente'}</span>
          </li>)}
        </ul>
        {me && <button disabled={disabled} onClick={() => setReady(!me.ready, view.revision)}>{me.ready ? 'Retirer mon statut prêt' : 'Je suis prêt'}</button>}
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

      <section className="panel journal" aria-labelledby="journal">
        <h2 id="journal">Journal du salon</h2>
        <ol reversed>
          {view.journal.slice().reverse().map((item) => {
            const actor = view.players.find((p) => p.id === item.actorId)?.name;
            return <li key={item.revision}><strong>{actor}</strong> {item.type === 'joined' ? 'a rejoint le salon.' : item.ready ? 'est prêt.' : 'a retiré son statut prêt.'}</li>;
          })}
        </ol>
      </section>
    </div>}
    <footer>Prototype de salon · La partie de plateau n’est pas encore disponible.</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
