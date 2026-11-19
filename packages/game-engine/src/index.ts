import { FACTION_IDS, JOURNAL_LIMIT, MAX_PLAYERS, REGION_CATALOG, REGION_SCORE_MARKER_CATALOG, initialRegionScores, preparationBlockers } from '@wonderland/shared';
import type { LobbyAction, LobbySnapshotV4, LobbyState, LobbyStateV1, LobbyStateV2, LobbyStateV3, LobbyView, Reply } from '@wonderland/shared';
import { firstTeaForSetup, initializeGame, teaTableForSetup } from './game.ts';
import type { RandomSource } from './game.ts';
import { assignRegionScoreMarkers } from './region-score-markers.ts';

export * from './battle.ts';
export * from './game.ts';
export * from './region-score-markers.ts';
export * from './two-player-region-setup.ts';

type NewPlayer = Pick<LobbyState['players'][number], 'id' | 'name'>;

export function createLobby(code: string, host: NewPlayer): LobbyState {
  return {
    version: 5, code, hostId: host.id, revision: 1, firstPlayerId: null, game: null, regionScores: null,
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
  return normalizeFirstPlayer({ ...old, version: 5, game: null, regionScores: null });
}

function drawRegionScores(playerCount: number, random: RandomSource) {
  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4 && playerCount !== 5) {
    throw new Error('Effectif incohérent pour l’affectation des marqueurs');
  }
  // WW-MAP-004 / WW-SETUP-004 étape 2 : toujours cinq Régions, aucune Quête tirée ici.
  return initialRegionScores.parse(assignRegionScoreMarkers({ playerCount }, random));
}

/** Receives a validated v4 snapshot; only initial setup is eligible for a backfill. */
export function migrateLobbyV4(old: LobbySnapshotV4, random: RandomSource): LobbyState {
  const regionScores = old.game ? old.regionScores ?? drawRegionScores(old.game.playerIds.length, random) : null;
  return normalizeFirstPlayer({ ...old, version: 5, regionScores });
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
  state: LobbyState, actorId: string, expectedRevision: number, newGameId: () => string, random: RandomSource,
): Reply<LobbyState> {
  if (!state.players.some(({ id }) => id === actorId)) return { ok: false, error: 'unauthorized' };
  if (actorId !== state.hostId) return { ok: false, error: 'host-required' };
  if (state.game) return { ok: false, error: 'already-launched' };
  // A successful concurrent admission must invalidate the host's old view of the roster.
  if (expectedRevision !== state.revision) return { ok: false, error: 'conflict' };
  const [blocker] = preparationBlockers(state);
  if (blocker) return { ok: false, error: blocker };
  const game = initializeGame(newGameId(), state.players.map(({ id }) => id));
  const regionScores = drawRegionScores(game.playerIds.length, random);
  return { ok: true, value: advance({ ...state, game, regionScores }, { revision: state.revision + 1, type: 'launch-preparation', actorId }) };
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
  const { game, regionScores } = state;
  const firstTeaPreview = game?.playerIds.includes(playerId) ? firstTeaForSetup(game, state.firstPlayerId) : null;
  return {
    code: state.code, hostId: state.hostId, revision: state.revision, you: playerId,
    firstPlayerId: state.firstPlayerId, canSelectFirstPlayer: hostInLobby,
    launch: hostInLobby ? { blockers: preparationBlockers(state) } : null,
    preparation: game && regionScores && firstTeaPreview ? {
      gameId: game.gameId,
      teaTable: teaTableForSetup(game),
      firstTeaPreview,
      regionScores: {
        placements: REGION_CATALOG.clockwise.map((regionId) => {
          const { markerId } = regionScores.placements.find((placement) => placement.regionId === regionId)!;
          const { pointsByRound } = REGION_SCORE_MARKER_CATALOG.markers.find(({ id }) => id === markerId)!;
          return { regionId, regionName: REGION_CATALOG.names[regionId], pointsByRound: { ...pointsByRound } };
        }),
        removalPending: game.playerIds.length === 2,
      },
    } : null,
    players: state.players.map(({ id, name, ready, faction }) => ({ id, name, ready, faction })),
    canSetReady: !state.game && state.players.some(({ id, faction }) => id === playerId && faction !== null),
    factions: FACTION_IDS.map((id) => {
      const owner = state.players.find(({ faction }) => faction === id);
      return { id, status: !owner ? 'available' : owner.id === playerId ? 'yours' : 'taken' };
    }),
    journal: state.journal,
  };
}
