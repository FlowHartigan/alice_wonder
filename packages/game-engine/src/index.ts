import { JOURNAL_LIMIT, MAX_PLAYERS } from '@wonderland/shared';
import type { LobbyAction, LobbyState, LobbyView, Reply } from '@wonderland/shared';

type NewPlayer = Pick<LobbyState['players'][number], 'id' | 'name'>;

export function createLobby(code: string, host: NewPlayer): LobbyState {
  return {
    version: 1, code, hostId: host.id, revision: 1, players: [{ ...host, ready: false }],
    journal: [{ revision: 1, type: 'joined', actorId: host.id }],
  };
}

function advance(state: LobbyState, event: LobbyState['journal'][number]): LobbyState {
  return { ...state, revision: event.revision, journal: [...state.journal, event].slice(-JOURNAL_LIMIT) };
}

export function joinLobby(state: LobbyState, player: NewPlayer): Reply<LobbyState> {
  if (state.players.some(({ id }) => id === player.id)) return { ok: false, error: 'already-seated' };
  if (state.players.length >= MAX_PLAYERS) return { ok: false, error: 'room-full' };
  const next = advance(state, { revision: state.revision + 1, type: 'joined', actorId: player.id });
  return { ok: true, value: { ...next, players: [...state.players, { ...player, ready: false }] } };
}

export function applyLobbyAction(state: LobbyState, actorId: string, action: LobbyAction): Reply<LobbyState> {
  const player = state.players.find(({ id }) => id === actorId);
  if (!player) return { ok: false, error: 'unauthorized' };
  if (player.ready === action.ready) return { ok: true, value: state };
  if (action.expectedRevision !== state.revision) return { ok: false, error: 'conflict' };
  const next = advance(state, { revision: state.revision + 1, type: action.type, actorId, ready: action.ready });
  return { ok: true, value: { ...next, players: state.players.map((p) => p.id === actorId ? { ...p, ready: action.ready } : p) } };
}

export function viewFor(state: LobbyState, playerId: string): LobbyView {
  return {
    code: state.code, hostId: state.hostId, revision: state.revision, you: playerId,
    players: state.players.map(({ id, name, ready }) => ({ id, name, ready })),
    journal: state.journal,
  };
}
