import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { makeServer } from '../apps/server/src/server.ts';
import { applyLobbyAction, createLobby, joinLobby, launchPreparation, normalizeFirstPlayer, viewFor } from '@wonderland/game-engine';
import { FACTION_IDS, REGION_CATALOG, gameState } from '@wonderland/shared';
import type { ClientEvents, FactionId, LobbyAction, LobbyView, RegionId, Reply, ServerEvents } from '@wonderland/shared';
import { SETUP_QUEST_CATALOG_V1, lobbySnapshotV6, lobbyState } from '@wonderland/shared/lobby-storage';
import type { LobbyState } from '@wonderland/shared/lobby-storage';

type LobbySocket = Socket<ServerEvents, ClientEvents>;
const clients: LobbySocket[] = [];
let server: ReturnType<typeof makeServer> | undefined;
let directory: string | undefined;

async function start(database = ':memory:', random?: () => number) {
  server = makeServer({ database, random });
  const listening = once(server.http, 'listening');
  server.http.listen(0, '127.0.0.1');
  await listening;
  const address = server.http.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  return `http://127.0.0.1:${address.port}`;
}

async function connect(url: string) {
  const socket: LobbySocket = io(url, {
    autoConnect: false, reconnection: false, forceNew: true, transports: ['websocket'], ackTimeout: 2000,
  });
  clients.push(socket);
  const connected = new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  socket.connect();
  await connected;
  return socket;
}

function nextUpdate(socket: LobbySocket) {
  return new Promise<LobbyView>((resolve) => socket.once('lobby:update', resolve));
}

function success<T>(reply: Reply<T>): T {
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}

// Acknowledging an action on its sender does not drain earlier broadcasts on other sockets.
async function actionWithUpdates(actor: LobbySocket, recipients: LobbySocket[], action: LobbyAction) {
  const revision = action.expectedRevision + 1;
  const cancel = new AbortController();
  const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(2000)]);
  try {
    const updates = Promise.all(recipients.map((socket) => new Promise<LobbyView>((resolve, reject) => {
      function cleanup() {
        socket.off('lobby:update', onUpdate);
        signal.removeEventListener('abort', onAbort);
      }
      function onUpdate(view: LobbyView) {
        if (view.revision !== revision) return;
        cleanup();
        resolve(view);
      }
      function onAbort() {
        cleanup();
        reject(new Error(`Diffusion de la révision ${revision} absente sur le socket ${socket.id}`, { cause: signal.reason }));
      }
      socket.on('lobby:update', onUpdate);
      signal.addEventListener('abort', onAbort, { once: true });
    })));
    const [view, received] = await Promise.all([actor.emitWithAck('lobby:action', action).then(success), updates]);
    return { view, received };
  } finally {
    cancel.abort();
  }
}

const selectFaction = (faction: FactionId, expectedRevision: number) =>
  ({ actionId: randomUUID(), type: 'select-faction', faction, expectedRevision } as const);
const setReady = (ready: boolean, expectedRevision: number) =>
  ({ actionId: randomUUID(), type: 'set-ready', ready, expectedRevision } as const);
const selectFirstPlayer = (firstPlayerId: string, expectedRevision: number) =>
  ({ actionId: randomUUID(), type: 'select-first-player', firstPlayerId, expectedRevision } as const);
const launch = (expectedRevision: number) =>
  ({ actionId: randomUUID(), type: 'launch-preparation', expectedRevision } as const);
const ownSeat = (view: LobbyView) => view.players.find((p) => p.id === view.you);
const available = (view: LobbyView) => view.factions.filter((f) => f.status === 'available').map((f) => f.id);

// Fisher–Yates with five zeros rotates the six pieces left by one.
const expectedPlacements = [
  { regionId: 'donjon-rouge', regionName: 'Donjon rouge', pointsByRound: { 1: 2, 2: 6, 3: 12 } },
  { regionId: 'foret-de-tulgey', regionName: 'Forêt de Tulgey', pointsByRound: { 1: 2, 2: 8, 3: 10 } },
  { regionId: 'jardin-des-fleurs-vivantes', regionName: 'Jardin des Fleurs vivantes', pointsByRound: { 1: 4, 2: 6, 3: 10 } },
  { regionId: 'mare-de-larmes', regionName: 'Mare de Larmes', pointsByRound: { 1: 4, 2: 8, 3: 8 } },
  { regionId: 'comte-de-la-deraison', regionName: 'Comté de la Déraison', pointsByRound: { 1: 6, 2: 6, 3: 8 } },
];
const expectedInventory = {
  placements: expectedPlacements.map(({ regionId }, i) => ({ regionId, markerId: `marqueur-score-0${i + 2}` })),
  storedMarkerId: 'marqueur-score-01',
};
// A quest shuffle with 29 zeros likewise rotates the complete deck left by one.
const questIds = SETUP_QUEST_CATALOG_V1.quests.map(({ id }) => id);
const expectedQuestSnapshot = { catalogVersion: 1, questOrder: [...questIds.slice(1), questIds[0]] };
const expectedReveal = {
  revealedQuestTitle: 'Remporter le croquet du Jardin',
  excludedRegion: { id: 'jardin-des-fleurs-vivantes', name: 'Jardin des Fleurs vivantes' },
};
const expectedActivePlacements = expectedPlacements.filter(({ regionId }) => regionId !== expectedReveal.excludedRegion.id);
const launchDraws = (count: number) => count === 2 ? 35 : 6;
const firstBattle = (dieResult: number, id: RegionId) => ({ dieResult, region: { id, name: REGION_CATALOG.names[id] } });
const rollOfOne = { dieVersion: 1, result: 1 };

function expectFiltered(view: LobbyView, ...tokens: string[]) {
  const json = JSON.stringify(view);
  expect(json).not.toMatch(/firstBattleRoll|dieVersion|questOrder|catalogVersion|quest-310|storedMarkerId|excludedPlacement|remainingQuestDeck|excludedQuests|activeRegion(Circuit|Neighbors)|marqueur-score-/);
  for (const { title } of SETUP_QUEST_CATALOG_V1.quests) {
    if (title !== view.preparation?.twoPlayerSetup?.revealedQuestTitle) expect(json).not.toContain(title);
  }
  for (const token of tokens) expect(json).not.toContain(token);
}

function tempDatabase() {
  directory = mkdtempSync(join(tmpdir(), 'ww-test-'));
  return join(directory, 'test.sqlite');
}

async function readyTable(url: string, count = 2) {
  const [host, guest, ...others] = await Promise.all(Array.from({ length: count }, () => connect(url)));
  const created = success(await host.emitWithAck('lobby:create', { name: 'Camille' }));
  const joined = success(await guest.emitWithAck('lobby:join', { code: created.session.code, name: 'Dinah' }));
  let view = joined.view;
  for (const [i, client] of others.entries()) {
    view = success(await client.emitWithAck('lobby:join', { code: created.session.code, name: `Invité ${i + 2}` })).view;
  }
  const edits = [];
  for (const [i, client] of [host, guest, ...others].entries()) {
    const faction = selectFaction(FACTION_IDS[i], view.revision);
    view = success(await client.emitWithAck('lobby:action', faction));
    const ready = setReady(true, view.revision);
    view = success(await client.emitWithAck('lobby:action', ready));
    edits.push({ faction, ready });
  }
  const choice = selectFirstPlayer(joined.view.you, view.revision);
  const { view: ready, received: [guestReady] } = await actionWithUpdates(host, [guest], choice);
  expect(guestReady).toMatchObject({ you: joined.view.you, revision: choice.expectedRevision + 1, firstPlayerId: choice.firstPlayerId });
  return { host, guest, created, joined, ready, choice, edits };
}

function databaseContents(db: DatabaseSync) {
  return {
    rooms: db.prepare('SELECT * FROM lobbies ORDER BY code').all(),
    sessions: db.prepare('SELECT * FROM sessions ORDER BY code, player_id').all(),
    receipts: db.prepare('SELECT * FROM accepted_actions ORDER BY code, player_id, action_id').all(),
  };
}

async function stop() {
  await server?.close();
  server = undefined;
}

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.disconnect();
  await stop();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

it('rejette un acteur inconnu et une révision périmée sans muter l’état', () => {
  const host = { id: randomUUID(), name: 'Alice' };
  const state = createLobby('12345678', host);
  const guest = { id: randomUUID(), name: 'Dinah' };
  const newer = success(joinLobby(state, guest));
  const action = selectFaction('alice', state.revision);
  expect(applyLobbyAction(newer, randomUUID(), action)).toEqual({ ok: false, error: 'unauthorized' });
  expect(applyLobbyAction(newer, host.id, action)).toEqual({ ok: false, error: 'conflict' });
  expect(state.players).toHaveLength(1);
  expect(newer.players.every((p) => !p.ready)).toBe(true);
});

it('refuse à la restauration les factions dupliquées et les sièges prêts sans faction', () => {
  const host = { id: randomUUID(), name: 'Alice' };
  const state = createLobby('12345678', host);
  expect(lobbyState.safeParse({ ...state, players: [{ ...state.players[0], ready: true }] }).success).toBe(false);
  const joined = success(joinLobby(state, { id: randomUUID(), name: 'Dinah' }));
  expect(lobbyState.safeParse({ ...joined, players: joined.players.map((p) => ({ ...p, faction: 'alice' })) }).success).toBe(false);
});

it('WW-SETUP-005 : seul l’hôte désigne un siège, y compris le sien, sans changer les joueurs', () => {
  const host = { id: randomUUID(), name: 'Alice' };
  const guest = { id: randomUUID(), name: 'Dinah' };
  const created = createLobby('12345678', host);
  const state = success(joinLobby(created, guest));
  expect(created.firstPlayerId).toBeNull();
  expect(state.firstPlayerId).toBeNull();
  const action = selectFirstPlayer(guest.id, state.revision);
  expect(applyLobbyAction(state, randomUUID(), action)).toEqual({ ok: false, error: 'unauthorized' });
  expect(applyLobbyAction(state, guest.id, action)).toEqual({ ok: false, error: 'host-required' });
  expect(applyLobbyAction(state, host.id, { ...action, firstPlayerId: randomUUID() })).toEqual({ ok: false, error: 'seat-not-found' });
  expect(applyLobbyAction(state, host.id, { ...action, expectedRevision: created.revision })).toEqual({ ok: false, error: 'conflict' });
  const picked = success(applyLobbyAction(state, host.id, action));
  expect(picked).toMatchObject({ firstPlayerId: guest.id, revision: state.revision + 1, players: state.players });
  expect(success(applyLobbyAction(picked, host.id, action))).toBe(picked);
  expect(applyLobbyAction(picked, guest.id, action)).toEqual({ ok: false, error: 'host-required' });
  expect(success(applyLobbyAction(picked, host.id, selectFirstPlayer(host.id, picked.revision))).firstPlayerId).toBe(host.id);
});

it('normalise uniquement la référence vers un siège absent, de façon idempotente', () => {
  const host = { id: randomUUID(), name: 'Alice' };
  const guest = { id: randomUUID(), name: 'Dinah' };
  const state = success(joinLobby(createLobby('12345678', host), guest));
  const selected = success(applyLobbyAction(state, host.id, selectFirstPlayer(guest.id, state.revision)));
  expect(normalizeFirstPlayer(state)).toBe(state);
  expect(normalizeFirstPlayer(selected)).toBe(selected);
  const dangling = { ...selected, players: selected.players.filter(({ id }) => id !== guest.id) };
  expect(lobbyState.safeParse(dangling).success).toBe(false);
  const normalized = normalizeFirstPlayer(dangling);
  const event = { revision: selected.revision + 1, type: 'first-player-cleared' };
  expect(lobbyState.parse(normalized)).toEqual({
    ...dangling, firstPlayerId: null, revision: event.revision, journal: [...selected.journal, event],
  });
  expect(normalizeFirstPlayer(normalized)).toBe(normalized);
});

it('refuse chaque précondition du lancement sans changer la configuration ni allouer de partie', () => {
  const host = { id: randomUUID(), name: 'Camille', ready: true, faction: 'alice' as const };
  const guest = { id: randomUUID(), name: 'Dinah', ready: true, faction: 'chapelier-fou' as const };
  const ready: LobbyState = { ...createLobby('12345678', host), players: [host, guest], firstPlayerId: guest.id };
  const newGameId = vi.fn(randomUUID);
  const random = vi.fn(() => 0);
  const refusals: [LobbyState, string, number, string][] = [
    [ready, randomUUID(), ready.revision, 'unauthorized'],
    [ready, guest.id, ready.revision, 'host-required'],
    [ready, host.id, ready.revision - 1, 'conflict'],
    [ready, host.id, ready.revision + 1, 'conflict'],
    [{ ...ready, players: [host], firstPlayerId: host.id }, host.id, ready.revision, 'player-count'],
    [{ ...ready, players: [host, guest, ...FACTION_IDS.slice(0, 4).map(() => ({ ...guest, id: randomUUID() }))] }, host.id, ready.revision, 'player-count'],
    [{ ...ready, players: [host, { ...guest, ready: false }] }, host.id, ready.revision, 'players-not-ready'],
    [{ ...ready, players: [host, { ...guest, ready: false, faction: null }] }, host.id, ready.revision, 'factions-incomplete'],
    [{ ...ready, players: [host, { ...guest, faction: host.faction }] }, host.id, ready.revision, 'factions-incomplete'],
    [{ ...ready, players: [host, { ...guest, faction: 'hors-catalogue' as FactionId }] }, host.id, ready.revision, 'factions-incomplete'],
    [{ ...ready, firstPlayerId: null }, host.id, ready.revision, 'first-player-required'],
    [{ ...ready, firstPlayerId: randomUUID() }, host.id, ready.revision, 'first-player-required'],
  ];
  for (const [state, actor, revision, error] of refusals) {
    const before = structuredClone(state);
    expect(launchPreparation(state, actor, revision, newGameId, random)).toEqual({ ok: false, error });
    expect(state).toEqual(before);
  }
  expect(newGameId).not.toHaveBeenCalled();
  expect(random).not.toHaveBeenCalled();
});

it('diffuse et persiste une seule préparation malgré deux lancements concurrents de l’hôte', async () => {
  const database = tempDatabase();
  const random = vi.fn(() => 0);
  const url = await start(database, random);
  const { host, guest, created, joined, ready, choice, edits } = await readyTable(url);
  const [secondHost, outsider] = await Promise.all([connect(url), connect(url)]);
  success(await secondHost.emitWithAck('lobby:resume', created.session));
  const received: LobbyView[] = [];
  guest.on('lobby:update', (view) => received.push(view));
  const outsiderUpdate = vi.fn();
  outsider.on('lobby:update', outsiderUpdate);
  const db = new DatabaseSync(database);
  try {
    const before = databaseContents(db);
    expect(await guest.emitWithAck('lobby:action', launch(ready.revision))).toEqual({ ok: false, error: 'host-required' });
    expect(await outsider.emitWithAck('lobby:action', launch(ready.revision))).toEqual({ ok: false, error: 'unauthorized' });
    const injected = { ...launch(ready.revision), actorId: created.view.you };
    expect(await host.emitWithAck('lobby:action', injected)).toEqual({ ok: false, error: 'invalid' });
    for (const extra of [{ twoPlayerSetup: expectedQuestSnapshot }, { dieResult: 3 }, { region: 'donjon-rouge' }, { firstBattleRoll: rollOfOne }]) {
      const injectedResult = { ...launch(ready.revision), ...extra };
      expect(await host.emitWithAck('lobby:action', injectedResult)).toEqual({ ok: false, error: 'invalid' });
    }
    expect(databaseContents(db)).toEqual(before);
    expect(random).not.toHaveBeenCalled();
    const requests = [launch(ready.revision), launch(ready.revision)];
    const update = nextUpdate(guest);
    const replies = await Promise.all([host, secondHost].map((client, i) => client.emitWithAck('lobby:action', requests[i])));
    const winner = replies.findIndex((reply) => reply.ok);
    expect(winner).toBeGreaterThanOrEqual(0);
    expect(replies[1 - winner]).toEqual({ ok: false, error: 'already-launched' });
    const prepared = success(replies[winner]);
    const guestView = await update;
    expect(guestView).toMatchObject({
      you: joined.view.you, revision: ready.revision + 1, players: ready.players, firstPlayerId: joined.view.you,
      preparation: prepared.preparation, canSetReady: false, canSelectFirstPlayer: false, launch: null,
    });
    expect(prepared.preparation).toEqual({ gameId: expect.any(String), teaTable: { openChairs: 11, activeBlockers: ['4J', '5J'] },
      firstTeaPreview: [
        { playerId: joined.view.you, turn: 1, plannedShards: 2 },
        { playerId: created.view.you, turn: 2, plannedShards: 1 },
      ],
      regionScores: { placements: expectedActivePlacements }, twoPlayerSetup: expectedReveal, firstBattle: firstBattle(1, 'comte-de-la-deraison') });
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
    expect(guestView).not.toHaveProperty('game');
    expectFiltered(guestView, created.session.token, joined.session.token);
    expectFiltered(prepared, created.session.token, joined.session.token);
    expect(prepared.journal.filter(({ type }) => type === 'launch-preparation')).toHaveLength(1);
    const persisted = databaseContents(db);
    const snapshot = lobbyState.parse(JSON.parse(String(persisted.rooms[0].snapshot)));
    expect(snapshot).toEqual({
      ...JSON.parse(String(before.rooms[0].snapshot)),
      revision: ready.revision + 1,
      journal: [...ready.journal, { type: 'launch-preparation', actorId: created.view.you, revision: ready.revision + 1 }],
      game: { gameId: prepared.preparation?.gameId, version: 1, revision: 0,
        phase: { type: 'setup' }, playerIds: ready.players.map(({ id }) => id), history: [], decisions: [] },
      regionScores: expectedInventory,
      twoPlayerSetup: expectedQuestSnapshot,
      firstBattleRoll: rollOfOne,
    });
    expect(viewFor(snapshot, randomUUID()).preparation).toBeNull();
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 7 });
    expect(persisted.sessions).toEqual(before.sessions);
    expect(persisted.receipts).toHaveLength(before.receipts.length + 1);

    expect(success(await host.emitWithAck('lobby:action', requests[winner]))).toEqual(prepared);
    expect(await host.emitWithAck('lobby:action', launch(prepared.revision))).toEqual({ ok: false, error: 'already-launched' });
    expect(await host.emitWithAck('lobby:action', { ...requests[winner], expectedRevision: prepared.revision }))
      .toEqual({ ok: false, error: 'conflict' });
    for (const revision of [ready.revision, prepared.revision]) {
      for (const edit of [setReady(false, revision), selectFaction('jabberwocky', revision), selectFirstPlayer(created.view.you, revision)]) {
        expect(await host.emitWithAck('lobby:action', edit)).toEqual({ ok: false, error: 'room-closed' });
      }
    }
    for (const edit of [choice, edits[0].faction, edits[0].ready]) {
      expect(success(await host.emitWithAck('lobby:action', edit))).toEqual(prepared);
    }
    const newSeat = { code: created.session.code, name: 'Trop tard' };
    expect(await outsider.emitWithAck('lobby:join', newSeat)).toEqual({ ok: false, error: 'room-closed' });
    expect(await outsider.emitWithAck('lobby:resume', { code: newSeat.code, token: 'a'.repeat(43) })).toEqual({ ok: false, error: 'unauthorized' });
    expect(outsiderUpdate).not.toHaveBeenCalled();
    guest.disconnect();
    const returned = await connect(url);
    expect(success(await returned.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
    expect(received).toEqual([guestView]);

    await stop();
    const restoredUrl = await start(database, random);
    const [hostRestored, guestRestored, newClient] = await Promise.all([connect(restoredUrl), connect(restoredUrl), connect(restoredUrl)]);
    expect(success(await hostRestored.emitWithAck('lobby:resume', created.session))).toEqual(prepared);
    expect(success(await guestRestored.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
    expect(await newClient.emitWithAck('lobby:join', newSeat)).toEqual({ ok: false, error: 'room-closed' });
    const afterRestoreUpdate = vi.fn();
    guestRestored.on('lobby:update', afterRestoreUpdate);
    expect(success(await hostRestored.emitWithAck('lobby:action', requests[winner]))).toEqual(prepared);
    // The resume ack on this socket follows any broadcast that the replay could have produced.
    expect(success(await guestRestored.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
    expect(afterRestoreUpdate).not.toHaveBeenCalled();
    expect(databaseContents(db)).toEqual(persisted);
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
  } finally { db.close(); }
});

it.each([
  { count: 2, openChairs: 11, activeBlockers: ['4J', '5J'], shards: [2, 1] },
  { count: 3, openChairs: 11, activeBlockers: ['4J', '5J'], shards: [3, 2, 1] },
  { count: 4, openChairs: 12, activeBlockers: ['5J'], shards: [3, 2, 2, 1] },
  { count: 5, openChairs: 13, activeBlockers: [], shards: [3, 2, 2, 1, 0] },
])('projette les mêmes chaises, marqueurs, Premier combat et aperçu du premier Thé à $count sièges', async ({ count, shards, ...teaTable }) => {
  const database = tempDatabase();
  let calls = 0;
  const random = vi.fn(() => ++calls === launchDraws(count) ? 0.5 : 0);
  const url = await start(database, random);
  const seats = await Promise.all(Array.from({ length: count }, () => connect(url)));
  const [host, ...guests] = seats;
  const created = success(await host.emitWithAck('lobby:create', { name: 'Camille' }));
  const { code } = created.session;
  const sessions = [created.session];
  const seatIds = [created.view.you];
  let view = created.view;
  for (const [i, guest] of guests.entries()) {
    const joined = success(await guest.emitWithAck('lobby:join', { code, name: `Invité ${i + 1}` }));
    sessions.push(joined.session);
    seatIds.push(joined.view.you);
    view = joined.view;
  }
  for (const [i, socket] of seats.entries()) {
    // Give Alice to the second admitted seat, not to the host.
    view = success(await socket.emitWithAck('lobby:action', selectFaction(FACTION_IDS[(i + count - 1) % count], view.revision)));
    view = success(await socket.emitWithAck('lobby:action', setReady(true, view.revision)));
  }
  const firstPlayerId = seatIds[1];
  const choice = selectFirstPlayer(firstPlayerId, view.revision);
  const { view: configured, received: choices } = await actionWithUpdates(host, seats, choice);
  const choiceRevision = choice.expectedRevision + 1;
  for (const [i, current] of choices.entries()) {
    expect(current).toMatchObject({ code, you: seatIds[i], revision: choiceRevision, firstPlayerId, preparation: null });
  }
  expect(random).not.toHaveBeenCalled();
  const request = launch(configured.revision);
  const { view: prepared, received: allViews } = await actionWithUpdates(host, seats, request);
  expect(allViews[0]).toEqual(prepared);
  const clockwise = [...seatIds.slice(1), seatIds[0]];
  expect(prepared.preparation).toEqual({ gameId: expect.any(String), teaTable,
    firstTeaPreview: shards.map((plannedShards, i) => ({ playerId: clockwise[i], turn: i + 1, plannedShards })),
    regionScores: { placements: count === 2 ? expectedActivePlacements : expectedPlacements },
    twoPlayerSetup: count === 2 ? expectedReveal : null,
    firstBattle: firstBattle(2, count === 2 ? 'donjon-rouge' : 'jardin-des-fleurs-vivantes') });
  const db = new DatabaseSync(database);
  try {
    const saved = lobbyState.parse(JSON.parse(String(databaseContents(db).rooms[0].snapshot)));
    expect(saved.regionScores).toEqual(expectedInventory);
    expect(saved.twoPlayerSetup).toEqual(count === 2 ? expectedQuestSnapshot : null);
    expect(saved.firstBattleRoll).toEqual({ dieVersion: 1, result: 2 });
  } finally { db.close(); }
  expect(random).toHaveBeenCalledTimes(launchDraws(count));
  for (const [i, current] of allViews.entries()) {
    expect(current).toMatchObject({ code, you: seatIds[i], revision: choiceRevision + 1, firstPlayerId });
    expect(current.preparation).toEqual(prepared.preparation);
    expect(current).not.toHaveProperty('game');
    expect(current).not.toHaveProperty('regionScores');
    expectFiltered(current, ...sessions.map(({ token }) => token));
  }
  for (const guest of guests) guest.disconnect();
  expect(success(await host.emitWithAck('lobby:resume', created.session))).toEqual(prepared);
  const returned = await connect(url);
  expect(success(await returned.emitWithAck('lobby:resume', sessions[1]))).toEqual(allViews[1]);
  await stop();
  const restoredUrl = await start(database, random);
  const restored = await Promise.all(sessions.map(async (session) =>
    success(await (await connect(restoredUrl)).emitWithAck('lobby:resume', session))));
  expect(restored).toEqual(allViews);
  expect(random).toHaveBeenCalledTimes(launchDraws(count));
});

it.each(['simultanément', 'après admission'] as const)('arbitre un lancement %s face à une nouvelle admission', async (order) => {
  const database = tempDatabase();
  const random = vi.fn(() => 0);
  const url = await start(database, random);
  const { host, created, ready } = await readyTable(url);
  const newcomer = await connect(url);
  const db = new DatabaseSync(database);
  try {
    const before = databaseContents(db);
    const attempt = launch(ready.revision);
    const admit = () => newcomer.emitWithAck('lobby:join', { code: created.session.code, name: 'Alice' });
    const startPreparation = () => host.emitWithAck('lobby:action', attempt);
    const [admission, launched] = order === 'simultanément'
      ? await Promise.all([admit(), startPreparation()]) : [await admit(), await startPreparation()];
    const after = databaseContents(db);
    if (admission.ok) {
      expect(launched).toEqual({ ok: false, error: 'conflict' });
      const current = success(await host.emitWithAck('lobby:resume', created.session));
      expect(current).toMatchObject({ revision: attempt.expectedRevision + 1, preparation: null, firstPlayerId: ready.firstPlayerId });
      expect(current.players).toEqual([...ready.players, { id: admission.value.view.you, name: 'Alice', ready: false, faction: null }]);
      expect(current.journal).toEqual([...ready.journal, { type: 'joined', actorId: admission.value.view.you, revision: current.revision }]);
      expect(after.receipts).toEqual(before.receipts);
      expect(after.sessions).toHaveLength(before.sessions.length + 1);
      expect(random).not.toHaveBeenCalled();
    } else {
      expect(admission).toEqual({ ok: false, error: 'room-closed' });
      expect(success(launched)).toMatchObject({ players: ready.players, revision: ready.revision + 1, preparation: { gameId: expect.any(String) } });
      expect(after.sessions).toEqual(before.sessions);
      expect(after.receipts).toHaveLength(before.receipts.length + 1);
      expect(random).toHaveBeenCalledTimes(launchDraws(2));
    }
    expect(after.rooms).toHaveLength(1);
  } finally { db.close(); }
});

it('annule le lancement si la preuve d’idempotence ne peut pas être écrite', async () => {
  const database = tempDatabase();
  const random = vi.fn(() => 0);
  const url = await start(database, random);
  const { host, guest, created, ready } = await readyTable(url);
  const db = new DatabaseSync(database);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const before = databaseContents(db);
    const update = vi.fn();
    guest.on('lobby:update', update);
    db.exec(`CREATE TRIGGER reject_receipt BEFORE INSERT ON accepted_actions
      BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
    const attempt = launch(ready.revision);
    expect(await guest.emitWithAck('lobby:action', attempt)).toEqual({ ok: false, error: 'host-required' });
    expect(random).not.toHaveBeenCalled();
    expect(await host.emitWithAck('lobby:action', attempt)).toEqual({ ok: false, error: 'unavailable' });
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
    expect(success(await host.emitWithAck('lobby:resume', created.session))).toEqual(ready);
    expect(databaseContents(db)).toEqual(before);
    expect(update).not.toHaveBeenCalled();
    db.exec('DROP TRIGGER reject_receipt');
    random.mockReturnValue(0.99);
    const { view, received: [guestView] } = await actionWithUpdates(host, [guest], attempt);
    expect(view.preparation?.regionScores.placements[0].pointsByRound).toEqual({ 1: 2, 2: 6, 3: 10 });
    expect(view.preparation?.twoPlayerSetup?.revealedQuestTitle).toBe('Peindre les roses');
    expect(view.preparation?.firstBattle).toEqual(firstBattle(3, 'foret-de-tulgey'));
    expect(random).toHaveBeenCalledTimes(2 * launchDraws(2));
    expect(update).toHaveBeenCalledExactlyOnceWith(guestView);
  } finally { log.mockRestore(); db.close(); }
});

it('refuse au démarrage des préparations incohérentes sans les réparer ni les rouvrir', async () => {
  const database = tempDatabase();
  const { host, ready } = await readyTable(await start(database));
  success(await host.emitWithAck('lobby:action', launch(ready.revision)));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const saved = databaseContents(db);
    const state = lobbyState.parse(JSON.parse(String(saved.rooms[0].snapshot)));
    const game = gameState.parse(state.game);
    const [first, second] = state.players;
    const lastEvent = { revision: state.revision, type: 'launch-preparation', actorId: second.id };
    const inventory = state.regionScores!;
    const [firstPlacement, secondPlacement, ...rest] = inventory.placements;
    const replaceFirst = (patch: object) => ({ regionScores: {
      ...inventory, placements: [{ ...firstPlacement, ...patch }, secondPlacement, ...rest],
    } });
    const corrupt = {
      'partie absente': { game: null },
      'inventaire absent': { regionScores: undefined },
      'inventaire nul': { regionScores: null },
      'région inconnue': replaceFirst({ regionId: 'ailleurs' }),
      'région en double': replaceFirst({ regionId: secondPlacement.regionId }),
      'marqueur inconnu': replaceFirst({ markerId: 'ailleurs' }),
      'marqueur en double': replaceFirst({ markerId: secondPlacement.markerId }),
      'placement manquant': { regionScores: { ...inventory, placements: [secondPlacement, ...rest] } },
      'sixième absent': { regionScores: { ...inventory, storedMarkerId: undefined } },
      'sixième inconnu': { regionScores: { ...inventory, storedMarkerId: 'ailleurs' } },
      'sixième déjà posé': { regionScores: { ...inventory, storedMarkerId: firstPlacement.markerId } },
      'placement écarté superflu': { regionScores: { ...inventory, excludedPlacement: firstPlacement } },
      'région déjà écartée': { regionScores: { ...inventory, placements: [secondPlacement, ...rest], excludedPlacement: firstPlacement } },
      'J1 absent': { firstPlayerId: null },
      'J1 orphelin': { firstPlayerId: randomUUID() },
      'hôte absent': { hostId: randomUUID() },
      'siège non prêt': { players: [first, { ...second, ready: false }] },
      'faction manquante': { players: [first, { ...second, faction: null }] },
      'faction dupliquée': { players: [first, { ...second, faction: first.faction }] },
      'ordre des sièges différent': { game: { ...game, playerIds: [second.id, first.id] } },
      'siège de jeu absent du salon': { game: { ...game, playerIds: [first.id, randomUUID()] } },
      'hors préparation': { game: { ...game, phase: { type: 'tea', round: 1 } } },
      'révision de jeu avancée': { game: { ...game, revision: 1 } },
      'décision de jeu déjà ouverte': { game: { ...game, decisions: [
        { id: randomUUID(), actorId: first.id, phase: game.phase, optionIds: [randomUUID()] },
      ] } },
      'journal sans lancement': { journal: state.journal.slice(0, -1) },
      'journal avec lancement non hôte': { journal: [...state.journal.slice(0, -1), lastEvent] },
    };
    const random = vi.fn(() => 0);
    for (const version of [4, 5, 6, 7]) {
      db.exec(`PRAGMA user_version = ${version}`);
      for (const [reason, patch] of Object.entries(corrupt)) {
        if (version === 4 && reason === 'inventaire absent') continue; // Only v4 allows a backfill.
        const legacyWithoutInventory = version === 4 && 'game' in patch && patch.game !== null;
        db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify({ ...state, version, ...patch,
          twoPlayerSetup: version >= 6 ? state.twoPlayerSetup : undefined,
          firstBattleRoll: version === 7 ? state.firstBattleRoll : undefined,
          ...(legacyWithoutInventory ? { regionScores: undefined } : {}),
        }));
        const before = databaseContents(db);
        expect(() => makeServer({ database, random }), `${reason} en v${version}`).toThrow();
        expect(databaseContents(db)).toEqual(before);
        expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(version);
      }
    }
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('synchronise cinq factions uniques et garde les jetons de session hors des vues', async () => {
  const url = await start();
  const host = await connect(url);
  const created = success(await host.emitWithAck('lobby:create', { name: 'Alice' }));
  const { code, token } = created.session;
  const guest = await connect(url);
  const receivedJoin = nextUpdate(host);
  const joined = success(await guest.emitWithAck('lobby:join', { code, name: 'Dinah' }));
  expect(await receivedJoin).toEqual({ ...joined.view, you: created.view.you, canSelectFirstPlayer: true,
    launch: { blockers: ['factions-incomplete', 'players-not-ready', 'first-player-required'] } });
  expect(joined.view.hostId).toBe(created.view.you);
  expect(joined.view.you).not.toBe(created.view.you);
  expect(JSON.stringify(joined.view)).not.toContain(token);
  expect(JSON.stringify(joined.view)).not.toContain(joined.session.token);

  const others = [];
  for (const name of ['Cécile', 'Léa', 'Patrice']) {
    const other = await connect(url);
    others.push(other);
    success(await other.emitWithAck('lobby:join', { code, name }));
  }
  const outsider = await connect(url);
  expect(await outsider.emitWithAck('lobby:join', { code, name: 'Sixième' })).toEqual({ ok: false, error: 'room-full' });
  expect(await outsider.emitWithAck('lobby:resume', { code, token: 'a'.repeat(43) })).toEqual({ ok: false, error: 'unauthorized' });

  const updates = Promise.all([host, ...others].map(nextUpdate));
  const action = selectFaction('alice', 5);
  expect(await outsider.emitWithAck('lobby:action', action)).toEqual({ ok: false, error: 'unauthorized' });
  expect(await guest.emitWithAck('lobby:action', { ...action, actorId: created.view.you } as typeof action)).toEqual({ ok: false, error: 'invalid' });
  expect(await guest.emitWithAck('lobby:action', { ...action, faction: 'hors-catalogue' as FactionId })).toEqual({ ok: false, error: 'invalid' });
  let changed = success(await guest.emitWithAck('lobby:action', action));
  expect(changed.players.filter((p) => p.faction).map((p) => p.id)).toEqual([joined.view.you]);
  for (const view of await updates) {
    expect(view.players).toEqual(changed.players);
    expect(view.factions).toContainEqual({ id: 'alice', status: 'taken' });
  }

  const seated = [guest, host, ...others];
  for (const [i, socket] of seated.entries()) {
    if (i > 0) changed = success(await socket.emitWithAck('lobby:action', selectFaction(FACTION_IDS[i], changed.revision)));
    changed = success(await socket.emitWithAck('lobby:action', setReady(true, changed.revision)));
    expect(ownSeat(changed)).toMatchObject({ faction: FACTION_IDS[i], ready: true });
  }
  expect(available(changed)).toEqual([]);
  expect(changed.players.every((p) => p.ready)).toBe(true);
  expect(new Set(changed.players.map((p) => p.faction))).toEqual(new Set(FACTION_IDS));
  const last = seated.at(-1)!;
  const lastFaction = FACTION_IDS.at(-1)!;
  expect(await last.emitWithAck('lobby:action', selectFaction('alice', changed.revision))).toEqual({ ok: false, error: 'faction-taken' });
  expect(success(await last.emitWithAck('lobby:action', selectFaction(lastFaction, changed.revision)))).toEqual(changed);
  expect(changed.firstPlayerId).toBeNull();
  const firstPlayerUpdates = Promise.all(seated.map(nextUpdate));
  const picked = success(await host.emitWithAck('lobby:action', selectFirstPlayer(joined.view.you, changed.revision)));
  for (const view of await firstPlayerUpdates) {
    expect(view).toMatchObject({ firstPlayerId: joined.view.you, revision: changed.revision + 1, players: changed.players });
    expect(view.canSelectFirstPlayer).toBe(view.you === created.view.you);
  }
  expect(picked.journal.at(-1)).toMatchObject({ type: 'select-first-player', firstPlayerId: joined.view.you });
  const prepared = success(await host.emitWithAck('lobby:action', launch(picked.revision)));
  expect(prepared).toMatchObject({ players: picked.players, firstPlayerId: joined.view.you, preparation: { gameId: expect.any(String) } });
  expect(await outsider.emitWithAck('lobby:join', { code, name: 'Sixième' })).toEqual({ ok: false, error: 'room-closed' });
});

it('valide la désignation sur le réseau, la synchronise et ne réapplique pas un ancien choix', async () => {
  const database = tempDatabase();
  const url = await start(database);
  const [host, guest, outsider] = await Promise.all([connect(url), connect(url), connect(url)]);
  const { session, view } = success(await host.emitWithAck('lobby:create', { name: 'Hôte' }));
  const joined = success(await guest.emitWithAck('lobby:join', { code: session.code, name: 'Dinah' }));
  expect(view).toMatchObject({ firstPlayerId: null, canSelectFirstPlayer: true });
  expect(joined.view).toMatchObject({ firstPlayerId: null, canSelectFirstPlayer: false });
  const choice = selectFirstPlayer(joined.view.you, joined.view.revision);
  expect(await outsider.emitWithAck('lobby:action', choice)).toEqual({ ok: false, error: 'unauthorized' });
  expect(await guest.emitWithAck('lobby:action', choice)).toEqual({ ok: false, error: 'host-required' });
  expect(await guest.emitWithAck('lobby:action', { ...choice, actorId: view.you } as typeof choice)).toEqual({ ok: false, error: 'invalid' });
  expect(await host.emitWithAck('lobby:action', { ...choice, firstPlayerId: 'invalide' })).toEqual({ ok: false, error: 'invalid' });
  expect(await host.emitWithAck('lobby:action', { ...choice, firstPlayerId: randomUUID() })).toEqual({ ok: false, error: 'seat-not-found' });
  expect(await host.emitWithAck('lobby:action', { ...choice, expectedRevision: view.revision })).toEqual({ ok: false, error: 'conflict' });
  expect(success(await guest.emitWithAck('lobby:resume', joined.session))).toEqual(joined.view);
  const update = nextUpdate(guest);
  const selected = success(await host.emitWithAck('lobby:action', choice));
  expect(await update).toEqual({ ...selected, you: joined.view.you, canSelectFirstPlayer: false, launch: null });
  expect(selected.revision).toBe(choice.expectedRevision + 1);
  expect(success(await host.emitWithAck('lobby:action', choice))).toEqual(selected);
  expect(success(await host.emitWithAck('lobby:action', selectFirstPlayer(choice.firstPlayerId, choice.expectedRevision)))).toEqual(selected);
  expect(await host.emitWithAck('lobby:action', { ...choice, firstPlayerId: view.you })).toEqual({ ok: false, error: 'conflict' });

  guest.disconnect();
  const reconnected = await connect(url);
  expect(success(await reconnected.emitWithAck('lobby:resume', joined.session)).firstPlayerId).toBe(joined.view.you);
  const selfChoice = selectFirstPlayer(view.you, selected.revision);
  const switched = success(await host.emitWithAck('lobby:action', selfChoice));
  expect(switched.firstPlayerId).toBe(view.you);
  expect(success(await host.emitWithAck('lobby:action', choice))).toEqual(switched);
  const finalChoice = success(await host.emitWithAck('lobby:action', selectFirstPlayer(joined.view.you, switched.revision)));
  await stop();
  const restoredUrl = await start(database);
  const [hostReturned, guestReturned] = await Promise.all([connect(restoredUrl), connect(restoredUrl)]);
  expect(success(await hostReturned.emitWithAck('lobby:resume', session))).toEqual(finalChoice);
  expect(success(await guestReturned.emitWithAck('lobby:resume', joined.session)))
    .toEqual({ ...finalChoice, you: joined.view.you, canSelectFirstPlayer: false, launch: null });
  expect(success(await hostReturned.emitWithAck('lobby:action', selfChoice))).toEqual(finalChoice);
});

it('arbitre deux demandes simultanées, libère la faction au changement et conserve la place à la reconnexion', async () => {
  const url = await start();
  const host = await connect(url);
  const guest = await connect(url);
  const created = success(await host.emitWithAck('lobby:create', { name: 'Hôte' }));
  const joined = success(await guest.emitWithAck('lobby:join', { code: created.session.code, name: 'Dinah' }));
  const { revision } = joined.view;
  expect(available(joined.view)).toEqual(FACTION_IDS);
  expect(joined.view.canSetReady).toBe(false);
  expect(await guest.emitWithAck('lobby:action', setReady(true, revision))).toEqual({ ok: false, error: 'faction-required' });

  const requests = [selectFaction('alice', revision), selectFaction('alice', revision)];
  const players = [host, guest];
  const sessions = [created.session, joined.session];
  const updates = Promise.all(players.map(nextUpdate));
  const replies = await Promise.all(players.map((socket, i) => socket.emitWithAck('lobby:action', requests[i])));
  const winner = replies.findIndex((reply) => reply.ok);
  expect(winner).toBeGreaterThanOrEqual(0);
  const loser = 1 - winner;
  expect(replies[loser]).toEqual({ ok: false, error: 'faction-taken' });
  const chosen = success(replies[winner]);
  expect(chosen.revision).toBe(revision + 1);
  expect(chosen.players.filter((p) => p.faction === 'alice')).toEqual([ownSeat(chosen)]);
  const views = await updates;
  expect(views[winner]).toEqual(chosen);
  expect(views[loser].factions).toContainEqual({ id: 'alice', status: 'taken' });
  expect(ownSeat(views[loser])).toMatchObject({ ready: false, faction: null });
  expect(available(views[loser])).not.toContain('alice');

  const actor = players[winner];
  const ready = success(await actor.emitWithAck('lobby:action', setReady(true, chosen.revision)));
  expect(ownSeat(ready)?.ready).toBe(true);
  for (const same of [requests[winner], selectFaction('alice', chosen.revision)]) {
    expect(success(await actor.emitWithAck('lobby:action', same))).toEqual(ready);
  }
  expect(await actor.emitWithAck('lobby:action', { ...requests[winner], faction: 'jabberwocky' })).toEqual({ ok: false, error: 'conflict' });
  expect(await actor.emitWithAck('lobby:action', { ...setReady(false, ready.revision), actionId: requests[winner].actionId })).toEqual({ ok: false, error: 'conflict' });

  const freed = nextUpdate(players[loser]);
  const changed = success(await actor.emitWithAck('lobby:action', selectFaction('jabberwocky', ready.revision)));
  expect(changed.revision).toBe(ready.revision + 1);
  expect(ownSeat(changed)).toMatchObject({ faction: 'jabberwocky', ready: false });
  expect(changed.journal.at(-1)).toMatchObject({ type: 'select-faction', faction: 'jabberwocky', previousFaction: 'alice', wasReady: true });
  expect(available(await freed)).toContain('alice');
  // An exact replay of an older successful selection never reacquires its previous faction.
  expect(success(await actor.emitWithAck('lobby:action', requests[winner]))).toEqual(changed);
  const claimed = success(await players[loser].emitWithAck('lobby:action', { ...requests[loser], expectedRevision: changed.revision }));
  expect(ownSeat(claimed)).toMatchObject({ faction: 'alice', ready: false });
  actor.disconnect();
  const returned = await connect(url);
  const resumed = success(await returned.emitWithAck('lobby:resume', sessions[winner]));
  expect(resumed).toMatchObject({ you: chosen.you, revision: claimed.revision, journal: claimed.journal });
  expect(ownSeat(resumed)).toMatchObject({ faction: 'jabberwocky', ready: false });
});

it('conserve la place, la faction, le statut et l’idempotence après réouverture de la base', async () => {
  const database = tempDatabase();
  const host = await connect(await start(database));
  const { session, view } = success(await host.emitWithAck('lobby:create', { name: 'Alice' }));
  const select = selectFaction('alice', view.revision);
  const picked = success(await host.emitWithAck('lobby:action', select));
  const action = setReady(true, picked.revision);
  const ready = success(await host.emitWithAck('lobby:action', action));
  host.disconnect();
  await stop();

  const returned = await connect(await start(database));
  expect(success(await returned.emitWithAck('lobby:resume', session))).toEqual(ready);
  expect(success(await returned.emitWithAck('lobby:action', select))).toEqual(ready);
  expect(success(await returned.emitWithAck('lobby:action', action))).toEqual(ready);
  expect(await returned.emitWithAck('lobby:action', { ...action, ready: false })).toEqual({ ok: false, error: 'conflict' });
});

function seedV1(database: string) {
  const code = '12345678';
  const hostId = randomUUID();
  const guestId = randomUUID();
  const hostToken = randomBytes(32).toString('base64url');
  const guestToken = randomBytes(32).toString('base64url');
  const ready = setReady(true, 2);
  const snapshot = {
    version: 1, code, hostId, revision: 3,
    players: [{ id: hostId, name: 'Hôte v1', ready: true }, { id: guestId, name: 'Invité v1', ready: false }],
    journal: [
      { revision: 1, type: 'joined', actorId: hostId },
      { revision: 2, type: 'joined', actorId: guestId },
      { revision: 3, type: 'set-ready', actorId: hostId, ready: true },
    ],
  };
  const db = new DatabaseSync(database);
  try {
    // Legacy DDL and fingerprint, independent of the production migration.
    db.exec(`
      CREATE TABLE lobbies (code TEXT PRIMARY KEY, snapshot TEXT NOT NULL) STRICT;
      CREATE TABLE sessions (code TEXT NOT NULL REFERENCES lobbies(code), player_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE, PRIMARY KEY (code, player_id)) STRICT;
      CREATE TABLE accepted_actions (code TEXT NOT NULL, player_id TEXT NOT NULL, action_id TEXT NOT NULL, intent TEXT NOT NULL,
        PRIMARY KEY (code, player_id, action_id), FOREIGN KEY (code, player_id) REFERENCES sessions(code, player_id)) STRICT;
      PRAGMA user_version = 1;
    `);
    db.prepare('INSERT INTO lobbies VALUES (?, ?)').run(code, JSON.stringify(snapshot));
    const session = db.prepare('INSERT INTO sessions VALUES (?, ?, ?)');
    for (const [id, token] of [[hostId, hostToken], [guestId, guestToken]]) {
      session.run(code, id, createHash('sha256').update(token).digest('hex'));
    }
    db.prepare('INSERT INTO accepted_actions VALUES (?, ?, ?, ?)').run(code, hostId, ready.actionId, 'set-ready:true:2');
  } finally { db.close(); }
  return { snapshot, ready, hostSession: { code, token: hostToken }, guestSession: { code, token: guestToken } };
}

it('migre un snapshot v1 sans perdre l’accès, et ne réapplique jamais un ancien succès prêt', async () => {
  const database = tempDatabase();
  const { snapshot, ready, hostSession, guestSession } = seedV1(database);
  const random = vi.fn(() => 0);
  const url = await start(database, random);
  const host = await connect(url);
  const guest = await connect(url);
  const migrated = success(await host.emitWithAck('lobby:resume', hostSession));
  const joined = success(await guest.emitWithAck('lobby:resume', guestSession));
  expect(joined.you).toBe(snapshot.players[1].id);
  expect(migrated).toMatchObject({
    code: snapshot.code, hostId: snapshot.hostId, you: snapshot.hostId, revision: 4, canSetReady: false, firstPlayerId: null,
    players: snapshot.players.map((p) => ({ ...p, ready: false, faction: null })),
    journal: [...snapshot.journal, { revision: 4, type: 'factions-enabled', resetReadyCount: 1 }],
  });
  expect(available(migrated)).toEqual(FACTION_IDS);
  expect(JSON.stringify(migrated)).not.toContain(hostSession.token);
  expect(JSON.stringify(migrated)).not.toContain(guestSession.token);
  expect(success(await host.emitWithAck('lobby:action', ready))).toEqual(migrated);
  expect(await host.emitWithAck('lobby:action', { ...ready, expectedRevision: 4 })).toEqual({ ok: false, error: 'conflict' });
  expect(await host.emitWithAck('lobby:action', setReady(true, 4))).toEqual({ ok: false, error: 'faction-required' });
  const picked = success(await host.emitWithAck('lobby:action', selectFaction('alice', 4)));
  // A replay still cannot make the seat ready now that it has a faction.
  expect(success(await host.emitWithAck('lobby:action', ready))).toEqual(picked);
  expect(await host.emitWithAck('lobby:action', setReady(true, 3))).toEqual({ ok: false, error: 'conflict' });
  expect(ownSeat(picked)?.ready).toBe(false);
  await stop();
  const returned = await connect(await start(database, random));
  expect(success(await returned.emitWithAck('lobby:resume', hostSession))).toEqual(picked);
  expect(success(await returned.emitWithAck('lobby:action', ready))).toEqual(picked);
  expect(random).not.toHaveBeenCalled();
});

it('migre un salon v2 de #5 sans changer ses factions, prêts, sièges, secrets, révision ou succès', async () => {
  const database = tempDatabase();
  const { snapshot: v1, ready: legacyReady, hostSession, guestSession } = seedV1(database);
  const [host, guest] = v1.players;
  const faction = selectFaction('alice', 4);
  const ready = setReady(true, 5);
  const guestFaction = selectFaction('chapelier-fou', 6);
  const snapshot = {
    ...v1, version: 2, revision: 7,
    players: [{ ...host, faction: faction.faction }, { ...guest, faction: guestFaction.faction }],
    journal: [...v1.journal,
      { revision: 4, type: 'factions-enabled', resetReadyCount: 1 },
      { revision: 5, type: faction.type, actorId: host.id, faction: faction.faction, previousFaction: null, wasReady: false },
      { revision: 6, type: ready.type, actorId: host.id, ready: true },
      { revision: 7, type: guestFaction.type, actorId: guest.id, faction: guestFaction.faction, previousFaction: null, wasReady: false },
    ],
  };
  const db = new DatabaseSync(database);
  try {
    // Seed a snapshot and accepted intents in the format of #5, without the new migrator.
    db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify(snapshot));
    const receipt = db.prepare('INSERT INTO accepted_actions VALUES (?, ?, ?, ?)');
    receipt.run(snapshot.code, host.id, faction.actionId, 'select-faction:alice:4');
    receipt.run(snapshot.code, host.id, ready.actionId, 'set-ready:true:5');
    receipt.run(snapshot.code, guest.id, guestFaction.actionId, 'select-faction:chapelier-fou:6');
    db.exec('PRAGMA user_version = 2');
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY player_id');
    const intents = db.prepare('SELECT * FROM accepted_actions ORDER BY player_id, action_id');
    const before = { sessions: sessions.all(), intents: intents.all() };

    const random = vi.fn(() => 0);
    const url = await start(database, random);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
    expect(JSON.parse(String(db.prepare('SELECT snapshot FROM lobbies').get()?.snapshot)))
      .toEqual({ ...snapshot, version: 7, firstPlayerId: null, game: null, regionScores: null, twoPlayerSetup: null, firstBattleRoll: null });
    expect({ sessions: sessions.all(), intents: intents.all() }).toEqual(before);
    const [h, g] = await Promise.all([connect(url), connect(url)]);
    const hostView = success(await h.emitWithAck('lobby:resume', hostSession));
    const guestView = success(await g.emitWithAck('lobby:resume', guestSession));
    expect(hostView).toMatchObject({ you: host.id, hostId: host.id, players: snapshot.players, firstPlayerId: null, revision: 7 });
    expect(guestView).toMatchObject({ you: guest.id, players: snapshot.players, firstPlayerId: null, revision: 7 });
    for (const replay of [legacyReady, faction, ready]) {
      expect(success(await h.emitWithAck('lobby:action', replay))).toEqual(hostView);
    }
    expect(success(await g.emitWithAck('lobby:action', guestFaction))).toEqual(guestView);
    const choice = selectFirstPlayer(guest.id, hostView.revision);
    const update = nextUpdate(g);
    const selected = success(await h.emitWithAck('lobby:action', choice));
    expect(selected).toMatchObject({ players: snapshot.players, firstPlayerId: guest.id, revision: 8 });
    expect(await update).toMatchObject({ players: snapshot.players, firstPlayerId: guest.id, revision: 8 });
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('migre un salon v3 prêt sans le lancer ni perdre J1 et les données existantes', async () => {
  const database = tempDatabase();
  const { created, joined, ready, choice } = await readyTable(await start(database));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const { game, regionScores, twoPlayerSetup, firstBattleRoll, ...open } = lobbyState.parse(JSON.parse(String(databaseContents(db).rooms[0].snapshot)));
    expect(game).toBeNull();
    expect(regionScores).toBeNull();
    expect(twoPlayerSetup).toBeNull();
    expect(firstBattleRoll).toBeNull();
    const snapshot = { ...open, version: 3 };
    db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify(snapshot));
    db.exec('PRAGMA user_version = 3');
    const before = databaseContents(db);

    const random = vi.fn(() => 0);
    const url = await start(database, random);
    const after = databaseContents(db);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
    expect(JSON.parse(String(after.rooms[0].snapshot))).toEqual({ ...snapshot, version: 7, game: null, regionScores: null, twoPlayerSetup: null, firstBattleRoll: null });
    expect(after.sessions).toEqual(before.sessions);
    expect(after.receipts).toEqual(before.receipts);
    const [host, guest] = await Promise.all([connect(url), connect(url)]);
    expect(success(await host.emitWithAck('lobby:resume', created.session))).toEqual(ready);
    expect(success(await host.emitWithAck('lobby:action', choice))).toEqual(ready);
    expect(success(await guest.emitWithAck('lobby:resume', joined.session))).toMatchObject({ you: joined.view.you, firstPlayerId: joined.view.you });
    expect(random).not.toHaveBeenCalled();
    expect(success(await host.emitWithAck('lobby:action', launch(ready.revision))).preparation).not.toBeNull();
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
  } finally { db.close(); }
});

it('migre les préparations v4 une seule fois, préserve les affectations présentes et laisse les salons ouverts', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0.99);
  const missing = await readyTable(url);
  const existing = await readyTable(url);
  const open = await readyTable(url);
  const missingAction = launch(missing.ready.revision);
  const existingAction = launch(existing.ready.revision);
  const missingBefore = success(await missing.host.emitWithAck('lobby:action', missingAction));
  const existingBefore = success(await existing.host.emitWithAck('lobby:action', existingAction));
  await stop();

  const db = new DatabaseSync(database);
  try {
    const seed = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    const fixtures = databaseContents(db).rooms.map(({ snapshot }) => {
      const { regionScores, twoPlayerSetup: _, firstBattleRoll: _roll, ...rest } = lobbyState.parse(JSON.parse(String(snapshot)));
      const preserved = rest.code === existing.created.session.code ? regionScores! : undefined;
      // v4's native format omitted the field. Also exercise a present, valid assignment in another order.
      const old = { ...rest, version: 4, regionScores: preserved && { ...preserved, placements: preserved.placements.toReversed() } };
      seed.run(JSON.stringify(old), rest.code);
      return old;
    });
    db.exec('PRAGMA user_version = 4');
    const before = databaseContents(db);
    const random = vi.fn(() => 0);
    const migratedUrl = await start(database, random);
    const migrationDraws = 5 + 2 * (29 + 1);
    expect(random).toHaveBeenCalledTimes(migrationDraws);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
    const migrated = databaseContents(db);
    expect(migrated.sessions).toEqual(before.sessions);
    expect(migrated.receipts).toEqual(before.receipts);
    expect(migrated.rooms.map(({ snapshot }) => JSON.parse(String(snapshot)))).toEqual(fixtures.map((old) => ({
      ...old, version: 7, regionScores: old.regionScores ?? (old.game ? expectedInventory : null),
      twoPlayerSetup: old.game ? expectedQuestSnapshot : null,
      firstBattleRoll: old.game ? rollOfOne : null,
    })));

    const [h, g, retained, waiting] = await Promise.all(Array.from({ length: 4 }, () => connect(migratedUrl)));
    const prepared = success(await h.emitWithAck('lobby:resume', missing.created.session));
    const migratedSetup = { twoPlayerSetup: expectedReveal, firstBattle: firstBattle(1, 'comte-de-la-deraison') };
    expect(prepared).toEqual({ ...missingBefore, preparation: { ...missingBefore.preparation,
      regionScores: { placements: expectedActivePlacements }, ...migratedSetup } });
    const guestView = success(await g.emitWithAck('lobby:resume', missing.joined.session));
    expect(guestView.preparation).toEqual(prepared.preparation);
    expect(success(await h.emitWithAck('lobby:action', missingAction))).toEqual(prepared);
    expect(success(await h.emitWithAck('lobby:action', missing.choice))).toEqual(prepared);
    expect(success(await g.emitWithAck('lobby:action', missing.edits[1].ready))).toEqual(guestView);
    const retainedView = { ...existingBefore, preparation: { ...existingBefore.preparation!, ...migratedSetup } };
    expect(success(await retained.emitWithAck('lobby:resume', existing.created.session))).toEqual(retainedView);
    expect(success(await retained.emitWithAck('lobby:action', existingAction))).toEqual(retainedView);
    expect(success(await waiting.emitWithAck('lobby:resume', open.created.session))).toEqual(open.ready);
    expect(success(await waiting.emitWithAck('lobby:action', open.choice))).toEqual(open.ready);

    await stop();
    const reopenedUrl = await start(database, random);
    const [returned, stillOpen] = await Promise.all([connect(reopenedUrl), connect(reopenedUrl)]);
    expect(success(await returned.emitWithAck('lobby:resume', missing.created.session))).toEqual(prepared);
    expect(success(await returned.emitWithAck('lobby:action', missingAction))).toEqual(prepared);
    expect(success(await stillOpen.emitWithAck('lobby:resume', open.created.session))).toEqual(open.ready);
    expect(random).toHaveBeenCalledTimes(migrationDraws);
    expect(databaseContents(db)).toEqual(migrated);
    expect(success(await stillOpen.emitWithAck('lobby:action', launch(open.ready.revision))).preparation?.regionScores)
      .toEqual({ placements: expectedActivePlacements });
    expect(random).toHaveBeenCalledTimes(migrationDraws + launchDraws(2));
  } finally { db.close(); }
});

it('annule toute la chaîne v4 → v7 si le lancer ne peut pas être écrit à la dernière étape', async () => {
  const database = tempDatabase();
  const { host, ready } = await readyTable(await start(database));
  success(await host.emitWithAck('lobby:action', launch(ready.revision)));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const { regionScores, twoPlayerSetup: _, firstBattleRoll: _roll, ...snapshot } = lobbyState.parse(JSON.parse(String(databaseContents(db).rooms[0].snapshot)));
    expect(regionScores).not.toBeNull();
    db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify({ ...snapshot, version: 4 }));
    const before = databaseContents(db);
    db.exec(`PRAGMA user_version = 4;
      CREATE TRIGGER reject_migration BEFORE UPDATE ON lobbies WHEN json_extract(NEW.snapshot, '$.version') = 7
      BEGIN SELECT RAISE(ABORT, 'test migration rollback'); END`);
    const random = vi.fn(() => 0);
    expect(() => makeServer({ database, random })).toThrow('test migration rollback');
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
    expect(databaseContents(db)).toEqual(before);
    db.exec('DROP TRIGGER reject_migration');
    await start(database, random);
    expect(random).toHaveBeenCalledTimes(2 * launchDraws(2));
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
  } finally { db.close(); }
});

it('migre v5 avec un seul mélange de Quêtes, sans remélanger les marqueurs ni modifier les autres salons', async () => {
  const database = tempDatabase();
  const originalUrl = await start(database, () => 0.99);
  const tables = [];
  for (const [count, launched] of [[2, false], [2, true], [3, true], [4, true], [5, true]] as const) {
    const table = await readyTable(originalUrl, count);
    const action = launched ? launch(table.ready.revision) : null;
    const view = action ? success(await table.host.emitWithAck('lobby:action', action)) : table.ready;
    tables.push({ ...table, count, action, view });
  }
  await stop();

  const db = new DatabaseSync(database);
  try {
    const v5 = databaseContents(db).rooms.map(({ snapshot }) => {
      const { twoPlayerSetup: _, firstBattleRoll: _roll, ...rest } = lobbyState.parse(JSON.parse(String(snapshot)));
      return { ...rest, version: 5 };
    });
    const seed = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    for (const fixture of v5) seed.run(JSON.stringify(fixture), fixture.code);
    db.exec('PRAGMA user_version = 5');
    const before = databaseContents(db);
    const launched2J = v5.find(({ game, players }) => game && players.length === 2)!;

    // Even if other salons were written first, the whole upgrade must roll back.
    db.exec(`CREATE TRIGGER reject_v6 BEFORE UPDATE ON lobbies WHEN OLD.code = '${launched2J.code}'
      BEGIN SELECT RAISE(ABORT, 'test v6 rollback'); END`);
    const failedRandom = vi.fn(() => 0.5);
    expect(() => makeServer({ database, random: failedRandom })).toThrow('test v6 rollback');
    expect(failedRandom).toHaveBeenCalledTimes(29);
    expect(databaseContents(db)).toEqual(before);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(5);
    db.exec('DROP TRIGGER reject_v6');

    const random = vi.fn(() => 0);
    await start(database, random);
    const migrated = databaseContents(db);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
    expect(migrated.sessions).toEqual(before.sessions);
    expect(migrated.receipts).toEqual(before.receipts);
    expect(migrated.rooms.map(({ snapshot }) => JSON.parse(String(snapshot)))).toEqual(v5.map((fixture) => ({
      ...fixture, version: 7, twoPlayerSetup: fixture === launched2J ? expectedQuestSnapshot : null,
      firstBattleRoll: fixture.game ? rollOfOne : null,
    })));
    expect(random).toHaveBeenCalledTimes(29 + 4);

    for (let reopen = 0; reopen < 2; reopen++) {
      await stop();
      const url = await start(database, random);
      for (const { action, view, count, created, joined, choice } of tables) {
        const [host, guest] = await Promise.all([connect(url), connect(url)]);
        const prepared = success(await host.emitWithAck('lobby:resume', created.session));
        const guestView = success(await guest.emitWithAck('lobby:resume', joined.session));
        const expected = action ? { ...view, preparation: { ...view.preparation!,
          twoPlayerSetup: count === 2 ? expectedReveal : null,
          firstBattle: firstBattle(1, count === 2 ? 'comte-de-la-deraison' : 'foret-de-tulgey'),
        } } : view;
        expect(prepared).toEqual(expected);
        expect(guestView.preparation).toEqual(expected.preparation);
        const update = vi.fn();
        guest.on('lobby:update', update);
        expect(success(await host.emitWithAck('lobby:action', action ?? choice))).toEqual(prepared);
        expect(success(await guest.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
        expect(update).not.toHaveBeenCalled();
        expectFiltered(prepared, created.session.token, joined.session.token);
        expectFiltered(guestView, created.session.token, joined.session.token);
      }
      expect(databaseContents(db)).toEqual(migrated);
      expect(random).toHaveBeenCalledTimes(29 + 4);
    }
  } finally { db.close(); }
});

it('migre v6 : un seul lancer par préparation 2–5J, sans changer les données antérieures', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0.99);
  const tables = [];
  for (const [count, launched] of [[2, false], [2, true], [3, true], [4, true], [5, true]] as const) {
    const table = await readyTable(url, count);
    const action = launched ? launch(table.ready.revision) : table.choice;
    if (launched) success(await table.host.emitWithAck('lobby:action', action));
    tables.push({ ...table, count, launched, action });
  }
  await stop();

  const db = new DatabaseSync(database);
  try {
    const seed = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    const fixtures = databaseContents(db).rooms.map(({ snapshot }) => {
      const { firstBattleRoll: _, ...rest } = lobbyState.parse(JSON.parse(String(snapshot)));
      const { regionScores, twoPlayerSetup } = rest;
      // Preserve a non-default placement order and a deck whose head excludes the Donjon.
      const order = twoPlayerSetup?.questOrder;
      const fixture = lobbySnapshotV6.parse({ ...rest, version: 6,
        regionScores: regionScores && { ...regionScores, placements: regionScores.placements.toReversed() },
        twoPlayerSetup: order && twoPlayerSetup ? { ...twoPlayerSetup, questOrder: [...order.slice(10), ...order.slice(0, 10)] } : null,
      });
      seed.run(JSON.stringify(fixture), fixture.code);
      return fixture;
    });
    db.exec('PRAGMA user_version = 6');
    const before = databaseContents(db);

    // Fail after at least one launched snapshot has already been written.
    db.exec(`CREATE TRIGGER reject_second_roll BEFORE UPDATE ON lobbies
      WHEN json_type(NEW.snapshot, '$.firstBattleRoll') = 'object' AND EXISTS (
        SELECT 1 FROM lobbies WHERE json_type(snapshot, '$.firstBattleRoll') = 'object'
      ) BEGIN SELECT RAISE(ABORT, 'test v7 rollback'); END`);
    const failedRandom = vi.fn(() => 0.99);
    expect(() => makeServer({ database, random: failedRandom })).toThrow('test v7 rollback');
    expect(failedRandom).toHaveBeenCalledTimes(2);
    expect(databaseContents(db)).toEqual(before);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(6);
    db.exec('DROP TRIGGER reject_second_roll');

    const random = vi.fn(() => 0.5);
    let migratedUrl = await start(database, random);
    const migrated = databaseContents(db);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
    expect(migrated.sessions).toEqual(before.sessions);
    expect(migrated.receipts).toEqual(before.receipts);
    expect(migrated.rooms.map(({ code }) => code)).toEqual(before.rooms.map(({ code }) => code));
    expect(migrated.rooms.map(({ snapshot }) => JSON.parse(String(snapshot)))).toEqual(fixtures.map((fixture) => ({
      ...fixture, version: 7, firstBattleRoll: fixture.game ? { dieVersion: 1, result: 2 } : null,
    })));

    for (let reopen = 0; reopen < 2; reopen++) {
      for (const { created, joined, ready, count, action, launched } of tables) {
        const [host, guest] = await Promise.all([connect(migratedUrl), connect(migratedUrl)]);
        const restored = success(await host.emitWithAck('lobby:resume', created.session));
        const guestView = success(await guest.emitWithAck('lobby:resume', joined.session));
        const update = vi.fn();
        guest.on('lobby:update', update);
        if (launched) {
          expect(restored.preparation?.firstBattle).toEqual(firstBattle(2, count === 2 ? 'mare-de-larmes' : 'jardin-des-fleurs-vivantes'));
          expect(restored.preparation?.twoPlayerSetup?.excludedRegion.id ?? null).toBe(count === 2 ? 'donjon-rouge' : null);
        } else expect(restored).toEqual(ready);
        expect(guestView.preparation).toEqual(restored.preparation);
        expect(success(await host.emitWithAck('lobby:action', action))).toEqual(restored);
        expect(success(await guest.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
        expect(update).not.toHaveBeenCalled();
        expectFiltered(restored, created.session.token, joined.session.token);
        expectFiltered(guestView, created.session.token, joined.session.token);
      }
      expect(random).toHaveBeenCalledTimes(4);
      expect(databaseContents(db)).toEqual(migrated);
      if (reopen === 0) {
        await stop();
        migratedUrl = await start(database, random);
      }
    }
  } finally { db.close(); }
});

it('ne répare jamais un lancer v7 absent, invalide ou enregistré dans un salon ouvert', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0);
  const open = await readyTable(url);
  const prepared = await readyTable(url);
  success(await prepared.host.emitWithAck('lobby:action', launch(prepared.ready.revision)));
  await stop();

  const db = new DatabaseSync(database);
  try {
    const snapshots = databaseContents(db).rooms.map(({ snapshot }) => lobbyState.parse(JSON.parse(String(snapshot))));
    const random = vi.fn(() => 0);
    const write = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    for (const snapshot of snapshots) {
      const invalid = snapshot.game ? [undefined, null, {}, { result: 1 }, { dieVersion: 1 },
        ...[0, 4, 1.5, '2'].map((result) => ({ dieVersion: 1, result })),
        { dieVersion: 2, result: 1 }, { ...rollOfOne, region: 'comte-de-la-deraison' },
      ] : [undefined, rollOfOne];
      for (const firstBattleRoll of invalid) {
        write.run(JSON.stringify({ ...snapshot, firstBattleRoll }), snapshot.code);
        const before = databaseContents(db);
        expect(() => makeServer({ database, random })).toThrow(/firstBattleRoll/);
        expect(databaseContents(db)).toEqual(before);
        expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
      }
      write.run(JSON.stringify(snapshot), snapshot.code);
    }
    expect(random).not.toHaveBeenCalled();
    const returned = await connect(await start(database, random));
    expect(success(await returned.emitWithAck('lobby:resume', open.created.session))).toEqual(open.ready);
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('refuse à la restauration v7 une version, des IDs, une phase ou un effectif de retrait incohérents', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0);
  const open = await readyTable(url);
  const two = await readyTable(url);
  const three = await readyTable(url, 3);
  for (const table of [two, three]) success(await table.host.emitWithAck('lobby:action', launch(table.ready.revision)));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const snapshots = databaseContents(db).rooms.map(({ snapshot }) => lobbyState.parse(JSON.parse(String(snapshot))));
    const forTable = (table: typeof open) => snapshots.find(({ code }) => code === table.created.session.code)!;
    const random = vi.fn(() => 0);
    const seed = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    const [head, ...tail] = expectedQuestSnapshot.questOrder;
    for (const [table, invalid] of [
      [open, expectedQuestSnapshot], [three, expectedQuestSnapshot], [two, null], [two, undefined],
      [two, { ...expectedQuestSnapshot, catalogVersion: 2 }],
      [two, { ...expectedQuestSnapshot, revealedQuestId: head }],
      [two, { ...expectedQuestSnapshot, questOrder: ['quest-99999', ...tail] }],
      [two, { ...expectedQuestSnapshot, questOrder: [tail[0], ...tail] }],
      [two, { ...expectedQuestSnapshot, questOrder: tail }],
      [two, { ...expectedQuestSnapshot, questOrder: [head, ...tail, head] }],
    ] as const) {
      const snapshot = forTable(table);
      seed.run(JSON.stringify({ ...snapshot, twoPlayerSetup: invalid }), snapshot.code);
      const saved = databaseContents(db);
      expect(() => makeServer({ database, random })).toThrow();
      expect(databaseContents(db)).toEqual(saved);
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
      seed.run(JSON.stringify(snapshot), snapshot.code);
    }
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('efface et sauvegarde un J1 devenu orphelin lors de la restauration v3, sans le rétablir au rejeu', async () => {
  const database = tempDatabase();
  const url = await start(database);
  const [host, guest] = await Promise.all([connect(url), connect(url)]);
  const { session } = success(await host.emitWithAck('lobby:create', { name: 'Alice' }));
  const { view, session: guestSession } = success(await guest.emitWithAck('lobby:join', { code: session.code, name: 'Dinah' }));
  const choice = selectFirstPlayer(view.you, view.revision);
  const selected = success(await host.emitWithAck('lobby:action', choice));
  await stop();

  // Simulate a restored roster without the selected seat; there is no removal action.
  const db = new DatabaseSync(database);
  try {
    const snapshot = { version: 3, code: selected.code, hostId: selected.hostId, firstPlayerId: selected.firstPlayerId,
      revision: selected.revision, journal: selected.journal, players: selected.players.filter(({ id }) => id !== view.you) };
    db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify(snapshot));
    db.exec('PRAGMA user_version = 3');
    const restoredUrl = await start(database);
    const [returned, removedGuest] = await Promise.all([connect(restoredUrl), connect(restoredUrl)]);
    expect(await removedGuest.emitWithAck('lobby:resume', guestSession)).toEqual({ ok: false, error: 'unauthorized' });
    const restored = success(await returned.emitWithAck('lobby:resume', session));
    const cleared = { revision: selected.revision + 1, type: 'first-player-cleared' };
    expect(restored).toMatchObject({ firstPlayerId: null, revision: cleared.revision, journal: [...selected.journal, cleared] });
    expect(success(await returned.emitWithAck('lobby:action', choice))).toEqual(restored);
    expect(await returned.emitWithAck('lobby:action', selectFirstPlayer(view.you, restored.revision)))
      .toEqual({ ok: false, error: 'seat-not-found' });
    expect(JSON.parse(String(db.prepare('SELECT snapshot FROM lobbies').get()?.snapshot)))
      .toEqual({ ...snapshot, version: 7, game: null, regionScores: null, twoPlayerSetup: null, firstBattleRoll: null,
        firstPlayerId: null, revision: restored.revision, journal: restored.journal });
    await stop();
    const reopened = await connect(await start(database));
    expect(success(await reopened.emitWithAck('lobby:resume', session))).toEqual(restored);
  } finally { db.close(); }
});

it('annule la migration complète en cas de snapshot v1 illisible', () => {
  const database = tempDatabase();
  const { snapshot } = seedV1(database);
  const db = new DatabaseSync(database);
  try {
    db.prepare('INSERT INTO lobbies VALUES (?, ?)').run('87654321', '{');
    expect(() => makeServer({ database })).toThrow();
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(1);
    expect(db.prepare('SELECT snapshot FROM lobbies WHERE code = ?').get(snapshot.code)?.snapshot).toBe(JSON.stringify(snapshot));
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()?.count).toBe(2);
    expect(db.prepare('SELECT intent FROM accepted_actions').get()?.intent).toBe('set-ready:true:2');
  } finally { db.close(); }
});
