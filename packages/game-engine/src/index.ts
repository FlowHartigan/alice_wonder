import { FACTION_IDS, JOURNAL_LIMIT, MAX_PLAYERS, preparationBlockers } from '@wonderland/shared';
import type { LobbyAction, LobbyState, LobbyStateV1, LobbyStateV2, LobbyStateV3, LobbyView, Reply } from '@wonderland/shared';
import { initializeGame, teaTableForSetup } from './game.ts';

export * from './battle.ts';
export * from './game.ts';
export * from './region-score-markers.ts';

type NewPlayer = Pick<LobbyState['players'][number], 'id' | 'name'>;

export function createLobby(code: string, host: NewPlayer): LobbyState {
  return {
    version: 4, code, hostId: host.id, revision: 1, firstPlayerId: null, game: null,
    players: [{ ...host, ready: false, faction: null }],
    journal: [{ revision: 1, type: 'joined', actorId: host.id }],
  };
}

function appendEvent<Event extends LobbyState['journal'][number]>(journal: Event[], event: NoInfer<Event>) {
  return { revision: event.revision, journal: [...journal, event].slice(-JOURNAL_LIMIT) };
}

function advance(state: LobbyState, event: LobbyState['journal'][number]): LobbyState {
  return { ...state, ...appendEvent(state.journal, event) };
}

export function migrateLobbyV1(old: LobbyStateV1): LobbyStateV2 {
  return {
    ...old, version: 2,
    players: old.players.map((player) => ({ ...player, ready: false, faction: null })),
    ...appendEvent<LobbyStateV2['journal'][number]>(old.journal, {
      revision: old.revision + 1, type: 'factions-enabled', resetReadyCount: old.players.filter((p) => p.ready).length,
    }),
  };
}

export function migrateLobbyV2(old: LobbyStateV2): LobbyStateV3 {
  return { ...old, version: 3, firstPlayerId: null };
}

export function migrateLobbyV3(old: LobbyStateV3): LobbyState {
  return normalizeFirstPlayer({ ...old, version: 4, game: null });
}

/** Restore before projecting, or call after a future roster removal and before committing it. */
export function normalizeFirstPlayer(state: LobbyState): LobbyState {
  if (state.game || state.firstPlayerId === null || state.players.some(({ id }) => id === state.firstPlayerId)) return state;
  return advance({ ...state, firstPlayerId: null }, { revision: state.revision + 1, type: 'first-player-cleared' });
}

export function joinLobby(state: LobbyState, player: NewPlayer): Reply<LobbyState> {
  if (state.game) return { ok: false, error: 'room-closed' };
  if (state.players.some(({ id }) => id === player.id)) return { ok: false, error: 'already-seated' };
  if (state.players.length >= MAX_PLAYERS) return { ok: false, error: 'room-full' };
  const next = advance(state, { revision: state.revision + 1, type: 'joined', actorId: player.id });
  return { ok: true, value: { ...next, players: [...state.players, { ...player, ready: false, faction: null }] } };
}

type LobbyEdit = Exclude<LobbyAction, { type: 'launch-preparation' }>;

export function launchPreparation(
  state: LobbyState, actorId: string, expectedRevision: number, newGameId: () => string,
): Reply<LobbyState> {
  if (!state.players.some(({ id }) => id === actorId)) return { ok: false, error: 'unauthorized' };
  if (actorId !== state.hostId) return { ok: false, error: 'host-required' };
  if (state.game) return { ok: false, error: 'already-launched' };
  // A successful concurrent admission must invalidate the host's old view of the roster.
  if (expectedRevision !== state.revision) return { ok: false, error: 'conflict' };
  const [blocker] = preparationBlockers(state);
  if (blocker) return { ok: false, error: blocker };
  const game = initializeGame(newGameId(), state.players.map(({ id }) => id));
  return { ok: true, value: advance({ ...state, game }, { revision: state.revision + 1, type: 'launch-preparation', actorId }) };
}

export function applyLobbyAction(state: LobbyState, actorId: string, action: LobbyEdit): Reply<LobbyState> {
  const player = state.players.find(({ id }) => id === actorId);
  if (!player) return { ok: false, error: 'unauthorized' };
  if (state.game) return { ok: false, error: 'room-closed' };
  const revision = state.revision + 1;
  if (action.type === 'select-first-player') {
    // WW-SETUP-005 — the host records the table's choice; the server never picks a default.
    if (actorId !== state.hostId) return { ok: false, error: 'host-required' };
    const { firstPlayerId } = action;
    if (!state.players.some(({ id }) => id === firstPlayerId)) return { ok: false, error: 'seat-not-found' };
    if (state.firstPlayerId === firstPlayerId) return { ok: true, value: state };
    if (action.expectedRevision !== state.revision) return { ok: false, error: 'conflict' };
    return { ok: true, value: advance({ ...state, firstPlayerId }, { revision, type: action.type, actorId, firstPlayerId }) };
  }
  if (action.type === 'select-faction') {
    if (player.faction === action.faction) return { ok: true, value: state };
    // WW-SETUP-002 — one lot per faction. Check against the current state under the write lock.
    if (state.players.some((p) => p.faction === action.faction)) return { ok: false, error: 'faction-taken' };
    if (action.expectedRevision !== state.revision) return { ok: false, error: 'conflict' };
    const next = advance(state, {
      revision, type: action.type, actorId, faction: action.faction, previousFaction: player.faction, wasReady: player.ready,
    });
    return { ok: true, value: { ...next, players: state.players.map((p) => p.id === actorId
      ? { ...p, faction: action.faction, ready: false } : p) } };
  }
  if (action.ready && player.faction === null) return { ok: false, error: 'faction-required' };
  if (player.ready === action.ready) return { ok: true, value: state };
  if (action.expectedRevision !== state.revision) return { ok: false, error: 'conflict' };
  const next = advance(state, { revision, type: action.type, actorId, ready: action.ready });
  return { ok: true, value: { ...next, players: state.players.map((p) => p.id === actorId ? { ...p, ready: action.ready } : p) } };
}

export function viewFor(state: LobbyState, playerId: string): LobbyView {
  const hostInLobby = !state.game && playerId === state.hostId;
  return {
    code: state.code, hostId: state.hostId, revision: state.revision, you: playerId,
    firstPlayerId: state.firstPlayerId, canSelectFirstPlayer: hostInLobby,
    launch: hostInLobby ? { blockers: preparationBlockers(state) } : null,
    preparation: state.game?.phase.type === 'setup'
      ? { gameId: state.game.gameId, teaTable: teaTableForSetup(state.game) }
      : null,
    players: state.players.map(({ id, name, ready, faction }) => ({ id, name, ready, faction })),
    canSetReady: !state.game && state.players.some(({ id, faction }) => id === playerId && faction !== null),
    factions: FACTION_IDS.map((id) => {
      const owner = state.players.find(({ faction }) => faction === id);
      return { id, status: !owner ? 'available' : owner.id === playerId ? 'yours' : 'taken' };
    }),
    journal: state.journal,
  };
}
