import { FACTION_IDS, JOURNAL_LIMIT, MAX_PLAYERS } from '@wonderland/shared';
import type { LobbyAction, LobbyState, LobbyStateV1, LobbyView, Reply } from '@wonderland/shared';

export * from './battle.ts';
export * from './game.ts';

type NewPlayer = Pick<LobbyState['players'][number], 'id' | 'name'>;

export function createLobby(code: string, host: NewPlayer): LobbyState {
  return {
    version: 2, code, hostId: host.id, revision: 1, players: [{ ...host, ready: false, faction: null }],
    journal: [{ revision: 1, type: 'joined', actorId: host.id }],
  };
}

function advance(state: LobbyState, event: LobbyState['journal'][number]): LobbyState {
  return { ...state, revision: event.revision, journal: [...state.journal, event].slice(-JOURNAL_LIMIT) };
}

export function migrateLobbyV1(old: LobbyStateV1): LobbyState {
  return advance({
    ...old, version: 2,
    players: old.players.map((player) => ({ ...player, ready: false, faction: null })),
  }, {
    revision: old.revision + 1, type: 'factions-enabled', resetReadyCount: old.players.filter((p) => p.ready).length,
  });
}

export function joinLobby(state: LobbyState, player: NewPlayer): Reply<LobbyState> {
  if (state.players.some(({ id }) => id === player.id)) return { ok: false, error: 'already-seated' };
  if (state.players.length >= MAX_PLAYERS) return { ok: false, error: 'room-full' };
  const next = advance(state, { revision: state.revision + 1, type: 'joined', actorId: player.id });
  return { ok: true, value: { ...next, players: [...state.players, { ...player, ready: false, faction: null }] } };
}

export function applyLobbyAction(state: LobbyState, actorId: string, action: LobbyAction): Reply<LobbyState> {
  const player = state.players.find(({ id }) => id === actorId);
  if (!player) return { ok: false, error: 'unauthorized' };
  const revision = state.revision + 1;
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
  return {
    code: state.code, hostId: state.hostId, revision: state.revision, you: playerId,
    players: state.players.map(({ id, name, ready, faction }) => ({ id, name, ready, faction })),
    canSetReady: state.players.some(({ id, faction }) => id === playerId && faction !== null),
    factions: FACTION_IDS.map((id) => {
      const owner = state.players.find(({ faction }) => faction === id);
      return { id, status: !owner ? 'available' : owner.id === playerId ? 'yours' : 'taken' };
    }),
    journal: state.journal,
  };
}
