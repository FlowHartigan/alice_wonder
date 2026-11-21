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
import { applyLobbyAction, createLobby, isReadyForSetupK, joinLobby, launchPreparation, normalizeFirstPlayer, shuffle, viewFor } from '@wonderland/game-engine';
import { FACTION_IDS, REGION_CATALOG, gameState } from '@wonderland/shared';
import type { ClientEvents, FactionId, GameAction, GameReceipt, InitialQuestView, LobbyAction, LobbyView, RegionId, Reply, ServerEvents, Session } from '@wonderland/shared';
import { SETUP_QUEST_CATALOG_V1, getSetupQuestV1, lobbySnapshotV6, lobbySnapshotV7, lobbySnapshotV8, lobbySnapshotV9, lobbyState, questOptionId, startingSeatResources } from '@wonderland/shared/lobby-storage';
import type { LobbySnapshotV8, LobbyState, QuestId } from '@wonderland/shared/lobby-storage';

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
const expectedQuestSnapshot = { catalogVersion: 1 as const, questOrder: [...questIds.slice(1), questIds[0]] };
const expectedReveal = {
  revealedQuestTitle: 'Remporter le croquet du Jardin',
  excludedRegion: { id: 'jardin-des-fleurs-vivantes', name: 'Jardin des Fleurs vivantes' },
};
const expectedActivePlacements = expectedPlacements.filter(({ regionId }) => regionId !== expectedReveal.excludedRegion.id);
const commonDraws = (_count: number) => 35;
const bagDraws = (count: number) => count === 2 ? 10 : 9; // Fisher–Yates: length - 1, per seat.
const launchDraws = (count: number) => commonDraws(count) + count * bagDraws(count);
const drawsForAllSizes = 2 * 10 + (3 + 4 + 5) * 9;
const newQuestDrawsForAllSizes = 3 * 29;
const firstBattle = (dieResult: number, id: RegionId) => ({ dieResult, region: { id, name: REGION_CATALOG.names[id] } });
const rollOfOne = { dieVersion: 1, result: 1 };

function publicPreparation(view: LobbyView) {
  if (!view.preparation) return null;
  const { initialQuest: _, initialBets: __, ...shared } = view.preparation;
  return shared;
}

function legacyV8({ initialQuests, centralReserves: _, ...state }: LobbyState, order = expectedQuestSnapshot.questOrder): LobbySnapshotV8 {
  return lobbySnapshotV8.parse({ ...state, version: 8,
    game: state.game && { ...state.game, decisions: [], history: [], revision: 0 },
    twoPlayerSetup: initialQuests?.twoPlayerOut ? { catalogVersion: 1, questOrder: order } : null,
  });
}

function expectedQuestZones(order: QuestId[], count: number) {
  const [head] = order;
  const removed = count === 2 ? order.filter((id) => getSetupQuestV1(id).exploitRegionId === getSetupQuestV1(head).exploitRegionId) : [];
  const active = order.filter((id) => !removed.includes(id));
  return { catalogVersion: 1, deck: active.slice(2 * count),
    seats: Array.from({ length: count }, (_, i) => ({ type: 'offer', cards: active.slice(i * 2, i * 2 + 2) })),
    twoPlayerOut: count === 2 ? { revealed: head, removed: removed.slice(1) } : null };
}

function expectedCentralReserves(single: number, double: number) {
  return { undistributedMadness: { single, double }, shardBank: { 1: 30, 5: 10 } };
}

function expectUpgrade(state: LobbyState, old: LobbySnapshotV8, fraction: number) {
  const { initialQuests, game, centralReserves, ...unchanged } = state;
  const { twoPlayerSetup, game: oldGame, ...prior } = old;
  expect(unchanged).toEqual({ ...prior, version: 10 });
  expect(centralReserves).toEqual(oldGame ? expectedCentralReserves(29 - 2 * old.players.length, 5 - old.players.length) : null);
  if (oldGame && game) expect({ ...game, decisions: [] }).toEqual(oldGame);
  else expect(game).toBe(oldGame);
  expect(initialQuests).toEqual(oldGame
    ? expectedQuestZones(twoPlayerSetup?.questOrder ?? shuffle(questIds, () => fraction), oldGame.playerIds.length) : null);
}

function expectedResources(playerId: string, faction: FactionId, count: number, poisonInReserve: number) {
  return {
    playerId, faction, boardFace: count === 2 ? 'golden-two-player' : 'ordinary',
    supportersInReserve: 10, supportersOnThirdForgeTrack: 4, castlesInReserve: 5,
    artifactsOnForge: 4, coveredAbilities: 4, leaderStrength: 1, shield: 'intact',
    victoryPoints: 0, combat: 0, bagTokenCount: count === 2 ? 11 : 10, poisonInReserve,
    activeTokenCount: 0, exhaustedTokenCount: 0, madnessTrackTokenCount: 0,
  };
}

function expectedHoldings({ game, players }: Pick<LobbyState, 'game' | 'players'>, fraction: (index: number) => number) {
  return game ? players.map(({ id, faction }, i) => {
    const seat = startingSeatResources(id, faction!, players.length);
    seat.tokenZones.bag = shuffle(seat.tokenZones.bag, () => fraction(i));
    return seat;
  }) : null;
}

function instanceIds(state: LobbyState) {
  return state.individualResources?.flatMap(({ tokenZones }) => Object.values(tokenZones).flatMap((zone) => zone.map(({ id }) => id))) ?? [];
}

function expectFiltered(view: LobbyView, ...tokens: string[]) {
  const json = JSON.stringify(view);
  expect(json).not.toMatch(/firstBattleRoll|dieVersion|questOrder|catalogVersion|quest-310|storedMarkerId|excludedPlacement|remainingQuestDeck|excludedQuests|activeRegion(Circuit|Neighbors)|marqueur-score-|twoPlayerOut|"deck"/);
  expect(json).not.toMatch(/tokenZones|forgeRewards|poisonReserve|leader-[12]|artifact-3|forge-1|madness-(single|double)|individualResourcesPreview|centralReserves|undistributedMadness|shardBank|commonSetupReady/);
  const quest = view.preparation?.initialQuest;
  const own = quest?.type === 'offer' ? quest.cards.map(({ title }) => title) : [quest?.card.title];
  for (const { title } of SETUP_QUEST_CATALOG_V1.quests) {
    if (title !== view.preparation?.twoPlayerSetup?.revealedQuestTitle && !own.includes(title)) expect(json).not.toContain(title);
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
  const sessions = [created.session, joined.session];
  let view = joined.view;
  for (const [i, client] of others.entries()) {
    const admission = success(await client.emitWithAck('lobby:join', { code: created.session.code, name: `Invité ${i + 2}` }));
    sessions.push(admission.session);
    view = admission.view;
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
  return { host, guest, seats: [host, guest, ...others], sessions, created, joined, ready, choice, edits };
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
    expect(state.centralReserves).toBeNull();
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
    expect(ready.preparation).toBeNull();
    expect(JSON.parse(String(before.rooms[0].snapshot)).centralReserves).toBeNull();
    const codeOnly = { code: created.session.code } as typeof created.session;
    expect(await outsider.emitWithAck('lobby:resume', codeOnly)).toEqual({ ok: false, error: 'invalid' });
    expect(await guest.emitWithAck('lobby:action', launch(ready.revision))).toEqual({ ok: false, error: 'host-required' });
    expect(await outsider.emitWithAck('lobby:action', launch(ready.revision))).toEqual({ ok: false, error: 'unauthorized' });
    const injected = { ...launch(ready.revision), actorId: created.view.you };
    expect(await host.emitWithAck('lobby:action', injected)).toEqual({ ok: false, error: 'invalid' });
    for (const extra of [{ twoPlayerSetup: expectedQuestSnapshot }, { dieResult: 3 }, { region: 'donjon-rouge' },
      { firstBattleRoll: rollOfOne }, { individualResources: [] }, { tokenId: randomUUID() }, { bagTokenCount: 11 },
      { centralReserves: expectedCentralReserves(25, 3) }]) {
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
      canSetReady: false, canSelectFirstPlayer: false, launch: null,
    });
    expect(publicPreparation(guestView)).toEqual(publicPreparation(prepared));
    expect(publicPreparation(prepared)).toEqual({ gameId: expect.any(String), teaTable: { openChairs: 11, activeBlockers: ['4J', '5J'] }, initialLeaders: null,
      firstTeaPreview: [
        { playerId: joined.view.you, turn: 1, plannedShards: 2 },
        { playerId: created.view.you, turn: 2, plannedShards: 1 },
      ],
      individualResources: [
        expectedResources(created.view.you, 'alice', 2, 0),
        expectedResources(joined.view.you, 'chapelier-fou', 2, 0),
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
         phase: { type: 'setup' }, playerIds: ready.players.map(({ id }) => id), history: [],
         decisions: expectedQuestZones(expectedQuestSnapshot.questOrder, 2).seats.map(({ cards }, i) => ({
           id: ready.players[i].id, actorId: ready.players[i].id, phase: { type: 'setup' },
           optionIds: cards.map((card) => questOptionId(snapshot.game!.gameId, card)),
         })) },
      regionScores: expectedInventory,
      initialQuests: expectedQuestZones(expectedQuestSnapshot.questOrder, 2),
      firstBattleRoll: rollOfOne,
      individualResources: expectedHoldings(snapshot, () => 0),
      centralReserves: expectedCentralReserves(25, 3),
    });
    expect(viewFor(snapshot, randomUUID()).preparation).toBeNull();
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 10 });
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
    expect(await outsider.emitWithAck('lobby:resume', codeOnly)).toEqual({ ok: false, error: 'invalid' });
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
    const dataVersion = db.prepare('PRAGMA data_version').get();
    expect(success(await hostRestored.emitWithAck('lobby:action', requests[winner]))).toEqual(prepared);
    // The resume ack on this socket follows any broadcast that the replay could have produced.
    expect(success(await guestRestored.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
    expect(afterRestoreUpdate).not.toHaveBeenCalled();
    expect(db.prepare('PRAGMA data_version').get()).toEqual(dataVersion);
    expect(databaseContents(db)).toEqual(persisted);
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
  } finally { db.close(); }
});

it.each([
  { count: 2, openChairs: 11, activeBlockers: ['4J', '5J'], shards: [2, 1], reserves: expectedCentralReserves(25, 3) },
  { count: 3, openChairs: 11, activeBlockers: ['4J', '5J'], shards: [3, 2, 1], reserves: expectedCentralReserves(23, 2) },
  { count: 4, openChairs: 12, activeBlockers: ['5J'], shards: [3, 2, 2, 1], reserves: expectedCentralReserves(21, 1) },
  { count: 5, openChairs: 13, activeBlockers: [], shards: [3, 2, 2, 1, 0], reserves: expectedCentralReserves(19, 0) },
])('conserve la dotation et les réserves à $count sièges, dont le Jabberwocky, sans fuite', async ({ count, shards, reserves, ...teaTable }) => {
  const database = tempDatabase();
  let calls = 0;
  const fraction = (i: number) => i % 2 === 0 ? 0.99 : 0;
  const random = vi.fn(() => {
    const draw = ++calls - commonDraws(count);
    return draw < 0 ? 0 : draw === 0 ? 0.5 : fraction(Math.floor((draw - 1) / bagDraws(count)));
  });
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
  // The host is Jabberwocky, while J1 is Alice (second admitted seat).
  const factions = ['jabberwocky' as const, ...FACTION_IDS.filter((id) => id !== 'jabberwocky')].slice(0, count);
  for (const [i, socket] of seats.entries()) {
    view = success(await socket.emitWithAck('lobby:action', selectFaction(factions[i], view.revision)));
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
  // A ready seat remains part of the launch even with no connection.
  seats.at(-1)!.disconnect();
  const { view: prepared, received: allViews } = await actionWithUpdates(host, seats.slice(0, -1), request);
  expect(allViews[0]).toEqual(prepared);
  const offlineSeat = await connect(url);
  allViews.push(success(await offlineSeat.emitWithAck('lobby:resume', sessions.at(-1)!)));
  offlineSeat.disconnect();
  const clockwise = [...seatIds.slice(1), seatIds[0]];
  expect(publicPreparation(prepared)).toEqual({ gameId: expect.any(String), teaTable, initialLeaders: null,
    firstTeaPreview: shards.map((plannedShards, i) => ({ playerId: clockwise[i], turn: i + 1, plannedShards })),
    individualResources: seatIds.map((id, i) => expectedResources(id, factions[i], count, i === 0 ? count + 2 : 0)),
    regionScores: { placements: count === 2 ? expectedActivePlacements : expectedPlacements },
    twoPlayerSetup: count === 2 ? expectedReveal : null,
    firstBattle: firstBattle(2, count === 2 ? 'donjon-rouge' : 'jardin-des-fleurs-vivantes') });
  const db = new DatabaseSync(database);
  const persisted = databaseContents(db);
  const saved = lobbyState.parse(JSON.parse(String(persisted.rooms[0].snapshot)));
  try {
    expect(saved.regionScores).toEqual(expectedInventory);
    expect(saved.initialQuests).toEqual(expectedQuestZones(expectedQuestSnapshot.questOrder, count));
    expect(saved.firstBattleRoll).toEqual({ dieVersion: 1, result: 2 });
    expect(saved.individualResources).toEqual(expectedHoldings(saved, fraction));
    expect(saved.centralReserves).toStrictEqual(reserves);
    const bags = saved.individualResources!.flatMap(({ tokenZones }) => tokenZones.bag);
    expect(reserves.undistributedMadness.single + bags.filter(({ type }) => type === 'madness-single').length).toBe(29);
    expect(reserves.undistributedMadness.double + bags.filter(({ type }) => type === 'madness-double').length).toBe(5);
    expect(new Set(bags.map(({ id }) => id)).size).toBe(bags.length);
    const { 1: ones, 5: fives } = saved.centralReserves!.shardBank;
    expect([ones + fives, ones + 5 * fives]).toEqual([40, 80]);
  } finally { db.close(); }
  expect(random).toHaveBeenCalledTimes(launchDraws(count));
  for (const [i, current] of allViews.entries()) {
    expect(current).toMatchObject({ code, you: seatIds[i], revision: choiceRevision + 1, firstPlayerId });
    expect(publicPreparation(current)).toEqual(publicPreparation(prepared));
    expect(current).not.toHaveProperty('game');
    expect(current).not.toHaveProperty('regionScores');
    expectFiltered(current, ...instanceIds(saved), ...sessions.map(({ token }) => token));
  }
  for (const guest of guests) guest.disconnect();
  expect(success(await host.emitWithAck('lobby:resume', created.session))).toEqual(prepared);
  host.disconnect(); // Jabberwocky's holdings remain unchanged while his seat is offline.
  const returned = await connect(url);
  expect(success(await returned.emitWithAck('lobby:resume', sessions[1]))).toEqual(allViews[1]);
  await stop();
  const restoredUrl = await start(database, random);
  const restoredSeats = await Promise.all(sessions.map(() => connect(restoredUrl)));
  const restored = await Promise.all(sessions.map((session, i) =>
    restoredSeats[i].emitWithAck('lobby:resume', session).then(success)));
  expect(restored).toEqual(allViews);
  expect(success(await restoredSeats[0].emitWithAck('lobby:action', request))).toEqual(prepared);
  expect(random).toHaveBeenCalledTimes(launchDraws(count));
  const restoredDb = new DatabaseSync(database);
  try { expect(databaseContents(restoredDb)).toEqual(persisted); } finally { restoredDb.close(); }
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
      expect(JSON.parse(String(after.rooms[0].snapshot)).centralReserves).toBeNull();
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

function offerOf(view: LobbyView) {
  const offer = view.preparation?.initialQuest;
  if (offer?.type !== 'offer') throw new Error('Offre attendue');
  return offer;
}

function questAction(offer: ReturnType<typeof offerOf>, index: number, actionId: string = randomUUID()): GameAction {
  return { type: 'submit-decision', actionId, expectedRevision: offer.revision,
    params: { decisionId: offer.decisionId, optionId: offer.cards[index].optionId } };
}

it.each([2, 3, 4, 5])('J et K–M à %i sièges : choix privés, signal unique et personnalisé, reprise et rejeu', async (count) => {
  const database = tempDatabase();
  const random = vi.fn(() => 0);
  const url = await start(database, random);
  const { host, ready, created, joined, seats, sessions } = await readyTable(url, count);
  const { received: views } = await actionWithUpdates(host, seats, launch(ready.revision));
  const offers = views.map(offerOf);
  expect(views.map((v) => v.preparation?.initialBets)).toEqual(Array(count).fill(null));
  expect(views.map((v) => v.preparation?.initialLeaders)).toEqual(Array(count).fill(null));
  const initialLeaders = { zone: 'end-of-table', leaders: views.map(({ you }, i) => ({ playerId: you, faction: FACTION_IDS[i] })) };
  expect(new Set(offers.flatMap(({ cards }) => cards.map(({ title }) => title))).size).toBe(2 * count);
  const db = new DatabaseSync(database);
  const read = () => lobbyState.parse(JSON.parse(String(databaseContents(db).rooms[0].snapshot)));
  try {
    const before = read();
    const common = { revision: before.revision, journal: before.journal, firstBattleRoll: before.firstBattleRoll,
      individualResources: before.individualResources, regionScores: before.regionScores, centralReserves: before.centralReserves };
    const originalOffers = before.initialQuests!.seats.map((seat) => seat.type === 'offer' ? seat.cards : neverOffer());
    let expectedDeck = before.initialQuests!.deck;
    let draws = launchDraws(count);
    expect(random).toHaveBeenCalledTimes(draws);
    expect(isReadyForSetupK(before)).toBe(false);
    const shadow = await connect(url); // Second socket for the same seat, using the real resume path.
    expect(success(await shadow.emitWithAck('lobby:resume', created.session))).toEqual(views[0]);
    const lastShadow = await connect(url);
    expect(success(await lastShadow.emitWithAck('lobby:resume', sessions.at(-1)!))).toEqual(views.at(-1));
    const outsider = await connect(url);
    const allSockets = [...seats, shadow, lastShadow, outsider];
    const updates = allSockets.map((socket) => {
      const log = vi.fn();
      socket.onAny(log);
      return log;
    });
    const sharedActionId = randomUUID(); // Same key can succeed independently for every seat.
    const requests = offers.map((offer, i) => questAction(offer, i % 2, sharedActionId));
    const receipts = [];
    const keptViews: InitialQuestView[] = [];
    // At 4–5J, leave one ready seat entirely offline when K–M become visible.
    const offlineSeat = count >= 4 ? 1 : -1;
    for (const [i, socket] of seats.entries()) {
      const last = i === count - 1;
      if (last && offlineSeat !== -1) seats[offlineSeat].disconnect();
      const { optionId: _, ...card } = offers[i].cards[i % 2];
      const [kept, returned] = i % 2 ? originalOffers[i].toReversed() : originalOffers[i];
      const receipt = success(await socket.emitWithAck('setup-quest:choose', requests[i]));
      expect(receipt).toEqual({ revision: 1, event: { type: 'decision-submitted', ...requests[i].params } });
      receipts.push(receipt);
      const authorView = { gameId: before.game!.gameId, revision: 1, type: 'kept', card } as const;
      keptViews.push(authorView);
      if (i === 0) expect(success(await shadow.emitWithAck('lobby:resume', created.session)).preparation?.initialQuest).toEqual(authorView);
      if (i === 0) expect(success(await seats[1].emitWithAck('lobby:resume', joined.session))).toEqual(views[1]);
      // An all-zero Fisher–Yates rotates the post-return deck one step left.
      expectedDeck = [...expectedDeck.slice(1), returned, expectedDeck[0]];
      draws += expectedDeck.length - 1;
      expect(random).toHaveBeenCalledTimes(draws);
      const current = read();
      expect(current).toMatchObject(common);
      expect(current.initialQuests!.deck).toEqual(expectedDeck);
      expect(current.initialQuests!.twoPlayerOut).toEqual(before.initialQuests!.twoPlayerOut);
      expect(current.initialQuests!.seats[i]).toEqual({ type: 'kept', card: kept });
      expect(current.initialQuests!.seats.slice(i + 1)).toEqual(before.initialQuests!.seats.slice(i + 1));
      expect(current.game).toMatchObject({ phase: { type: 'setup' }, revision: i + 1 });
      expect(isReadyForSetupK(current)).toBe(last);
      expect(current).not.toHaveProperty('initialBets');
      expect(current).not.toHaveProperty('initialLeaders');
      expect(current.game).not.toHaveProperty('initialLeaders');
      for (const [j, view] of views.entries()) {
        const projected = viewFor(current, view.you);
        expect(projected.preparation?.initialLeaders).toStrictEqual(last ? initialLeaders : null);
        if (j > i) expect(projected).toEqual(view); // No revision, signal, or observable pending count change.
        expect(projected.journal).toEqual(view.journal);
        expectFiltered(projected);
      }
      const persisted = databaseContents(db);
      expect(success(await socket.emitWithAck('setup-quest:choose', requests[i]))).toEqual(receipt);
      expect(await socket.emitWithAck('setup-quest:choose', questAction(offers[i], 1 - i % 2, sharedActionId)))
        .toEqual({ ok: false, error: 'conflict' });
      expect(await socket.emitWithAck('setup-quest:choose', { ...questAction(offers[i], 1 - i % 2), expectedRevision: 1 }))
        .toEqual({ ok: false, error: 'decision-unavailable' });
      expect(await outsider.emitWithAck('setup-quest:choose', requests[i])).toEqual({ ok: false, error: 'unauthorized' });
      expect(await outsider.emitWithAck('lobby:join', { code: created.session.code, name: 'Hors salon' })).toEqual({ ok: false, error: 'room-closed' });
      expect(await outsider.emitWithAck('lobby:resume', { code: created.session.code, token: 'X'.repeat(43) }))
        .toEqual({ ok: false, error: 'unauthorized' });
      expect(databaseContents(db)).toEqual(persisted);
      expect(random).toHaveBeenCalledTimes(draws);
      // Drain each recipient connection before asserting absence of cross-seat messages.
      await Promise.all(allSockets.filter((client) => client.connected)
        .map((client) => client.emitWithAck('setup-quest:choose', { ...requests[i], expectedRevision: -1 })));
      const expectedCalls = [...seats.map((_, j) => j), 0, count - 1, -1].map((j) => {
        if (j === -1 || (last && j === offlineSeat)) return [];
        if (!last) return j === i ? [['setup-quest:update', authorView]] : [];
        const original = views[j];
        return [['lobby:update', { ...original, preparation: { ...original.preparation,
          initialQuest: keptViews[j], initialBets: count === 2 ? [] : FACTION_IDS.slice(0, count).filter((_, k) => j !== k),
          initialLeaders,
        } }]];
      });
      expect(updates.map((log) => log.mock.calls)).toEqual(expectedCalls);
      for (const log of updates) log.mockClear();
    }
    const all = read();
    expect([...all.initialQuests!.deck, ...all.initialQuests!.seats.flatMap((seat) => seat.type === 'kept' ? [seat.card] : neverOffer()),
      ...(all.initialQuests!.twoPlayerOut ? [all.initialQuests!.twoPlayerOut.revealed, ...all.initialQuests!.twoPlayerOut.removed] : [])].sort())
      .toEqual([...questIds].sort());
    const persisted = databaseContents(db);
    const dataVersion = db.prepare('PRAGMA data_version').get();
    if (offlineSeat !== -1) {
      const reconnected = await connect(url);
      const resumed = success(await reconnected.emitWithAck('lobby:resume', sessions[offlineSeat]));
      expect(resumed.preparation?.initialLeaders).toStrictEqual(initialLeaders);
      expect(resumed.preparation?.initialQuest).toEqual(keptViews[offlineSeat]);
    }
    await stop();
    const restoredUrl = await start(database, random);
    for (const [i, session] of sessions.entries()) {
      const socket = await connect(restoredUrl);
      const log = vi.fn();
      socket.onAny(log);
      const restored = success(await socket.emitWithAck('lobby:resume', session));
      expect(restored).toEqual(viewFor(all, views[i].you));
      expect(restored.preparation?.initialLeaders).toStrictEqual(initialLeaders);
      expect(success(await socket.emitWithAck('setup-quest:choose', requests[i]))).toEqual(receipts[i]);
      expect(log).not.toHaveBeenCalled();
    }
    expect(databaseContents(db)).toEqual(persisted);
    expect(db.prepare('PRAGMA data_version').get()).toEqual(dataVersion);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 10 });
    expect(random).toHaveBeenCalledTimes(draws);
  } finally { db.close(); }
});

function neverOffer(): never { throw new Error('Zone de Quête inattendue'); }

it('J refuse les intentions non autorisées et sérialise doublons, options rivales et sièges distincts', async () => {
  const database = tempDatabase();
  const random = vi.fn(() => 0);
  const url = await start(database, random);
  const { host, guest, ready, created, joined } = await readyTable(url);
  const shadow = await connect(url);
  success(await shadow.emitWithAck('lobby:resume', created.session));
  const outsider = await connect(url);
  const prelaunch: GameAction = { type: 'submit-decision', actionId: randomUUID(), expectedRevision: 0,
    params: { decisionId: randomUUID(), optionId: randomUUID() } };
  expect(await host.emitWithAck('setup-quest:choose', prelaunch)).toEqual({ ok: false, error: 'wrong-phase' });
  expect(random).not.toHaveBeenCalled();
  const { received: [hostView, guestView] } = await actionWithUpdates(host, [host, guest], launch(ready.revision));
  const own = questAction(offerOf(hostView), 0);
  const other = questAction(offerOf(guestView), 1, own.actionId);
  const db = new DatabaseSync(database);
  const error = (error: string) => ({ ok: false, error });
  try {
    const before = databaseContents(db);
    const state = lobbyState.parse(JSON.parse(String(before.rooms[0].snapshot)));
    const foreignOption = (optionId: string) => ({ ...own, params: { ...own.params, optionId } });
    expect(await outsider.emitWithAck('setup-quest:choose', own)).toEqual(error('unauthorized'));
    expect(await outsider.emitWithAck('lobby:resume', { code: created.session.code, token: 'X'.repeat(43) })).toEqual(error('unauthorized'));
    expect(await host.emitWithAck('lobby:resume', joined.session)).toEqual(error('already-seated'));
    expect(await host.emitWithAck('setup-quest:choose', other)).toEqual(error('decision-unavailable'));
    expect(await host.emitWithAck('setup-quest:choose', foreignOption(other.params.optionId))).toEqual(error('invalid'));
    expect(await host.emitWithAck('setup-quest:choose', foreignOption(questOptionId(state.game!.gameId, state.initialQuests!.deck[0]))))
      .toEqual(error('invalid'));
    expect(await host.emitWithAck('setup-quest:choose', foreignOption(randomUUID()))).toEqual(error('invalid'));
    expect(await host.emitWithAck('setup-quest:choose', { ...own, expectedRevision: 1 })).toEqual(error('conflict'));
    for (const invalid of [{ ...own, actorId: guestView.you }, { ...own, revision: 0 },
      { ...own, params: { ...own.params, returned: 'quest-31001' } }, { ...own, params: null }, { ...own, actionId: 'no' }]) {
      expect(await host.emitWithAck('setup-quest:choose', invalid as GameAction)).toEqual(error('invalid'));
    }
    expect(databaseContents(db)).toEqual(before);
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
    const rival = questAction(offerOf(hostView), 1);
    const [a, b, c, d] = await Promise.all([
      host.emitWithAck('setup-quest:choose', own), shadow.emitWithAck('setup-quest:choose', own),
      shadow.emitWithAck('setup-quest:choose', rival), guest.emitWithAck('setup-quest:choose', other),
    ]);
    expect(a).toEqual(b);
    expect(a.ok).not.toBe(c.ok);
    expect(d.ok).toBe(true); // The other's private revision 0 stays valid regardless of host ordering.
    expect(a.ok ? c : a).toEqual(error('conflict'));
    expect(random).toHaveBeenCalledTimes(launchDraws(2) + 20 + 21);
    const after = databaseContents(db);
    const final = lobbyState.parse(JSON.parse(String(after.rooms[0].snapshot)));
    expect(final.game?.history).toHaveLength(2);
    expect(isReadyForSetupK(final)).toBe(true);
    expect(after.receipts).toEqual(before.receipts);
    expect(after.sessions).toEqual(before.sessions);
  } finally { db.close(); }
});

it('la reprise avant le dernier choix et son rollback gardent K–M masqués jusqu’au commit réussi', async () => {
  const database = tempDatabase();
  const random = vi.fn(() => 0);
  const { host, guest, ready, sessions } = await readyTable(await start(database, random));
  const { received: [hostView, guestView] } = await actionWithUpdates(host, [host, guest], launch(ready.revision));
  const firstChoice = questAction(offerOf(hostView), 0);
  const firstReceipt = success(await host.emitWithAck('setup-quest:choose', firstChoice));
  const hostKept = success(await host.emitWithAck('lobby:resume', sessions[0]));
  expect(hostKept.preparation).toMatchObject({ initialQuest: { type: 'kept' }, initialBets: null, initialLeaders: null });
  const db = new DatabaseSync(database);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const ownUpdates = vi.fn();
  const guestUpdates = vi.fn();
  try {
    const before = databaseContents(db);
    const dataVersion = db.prepare('PRAGMA data_version').get();
    await stop();
    const restoredUrl = await start(database, random);
    const [resumedHost, resumedGuest] = await Promise.all([connect(restoredUrl), connect(restoredUrl)]);
    resumedHost.onAny(ownUpdates);
    resumedGuest.onAny(guestUpdates);
    expect(success(await resumedHost.emitWithAck('lobby:resume', sessions[0]))).toEqual(hostKept);
    expect(success(await resumedGuest.emitWithAck('lobby:resume', sessions[1]))).toEqual(guestView);
    expect(success(await resumedHost.emitWithAck('setup-quest:choose', firstChoice))).toEqual(firstReceipt);
    expect(db.prepare('PRAGMA data_version').get()).toEqual(dataVersion);
    const choice = questAction(offerOf(guestView), 0);
    db.exec(`CREATE TRIGGER reject_choice AFTER UPDATE ON lobbies
      BEGIN SELECT RAISE(ABORT, 'rollback du dernier choix J'); END`);
    expect(await resumedGuest.emitWithAck('setup-quest:choose', choice)).toEqual({ ok: false, error: 'unavailable' });
    expect(random).toHaveBeenCalledTimes(launchDraws(2) + 20 + 21);
    expect(databaseContents(db)).toEqual(before);
    expect(success(await resumedHost.emitWithAck('lobby:resume', sessions[0]))).toEqual(hostKept);
    expect(success(await resumedGuest.emitWithAck('lobby:resume', sessions[1]))).toEqual(guestView);
    expect(ownUpdates).not.toHaveBeenCalled();
    expect(guestUpdates).not.toHaveBeenCalled();
    db.exec('DROP TRIGGER reject_choice');
    expect(success(await resumedGuest.emitWithAck('setup-quest:choose', choice)).revision).toBe(1);
    expect(random).toHaveBeenCalledTimes(launchDraws(2) + 20 + 2 * 21);
    for (const [i, socket] of [resumedHost, resumedGuest].entries()) {
      const view = success(await socket.emitWithAck('lobby:resume', sessions[i]));
      expect(view.preparation).toMatchObject({ initialQuest: { type: 'kept' }, initialBets: [],
        initialLeaders: { zone: 'end-of-table', leaders: [
          { playerId: hostView.you, faction: FACTION_IDS[0] }, { playerId: guestView.you, faction: FACTION_IDS[1] },
        ] },
      });
      expect([ownUpdates, guestUpdates][i].mock.calls).toEqual([['lobby:update', view]]);
    }
  } finally { log.mockRestore(); db.close(); }
});

it.each([
  ['le reçu', 'BEFORE INSERT ON accepted_actions'],
  ['le snapshot', 'BEFORE UPDATE ON lobbies'],
])('annule le lancement si %s ne peut pas être écrit', async (_, trigger) => {
  const database = tempDatabase();
  const random = vi.fn(() => 0);
  const url = await start(database, random);
  const { host, guest, created, ready } = await readyTable(url);
  const db = new DatabaseSync(database);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const before = databaseContents(db);
    expect(JSON.parse(String(before.rooms[0].snapshot)).centralReserves).toBeNull();
    const update = vi.fn();
    guest.on('lobby:update', update);
    db.exec(`CREATE TRIGGER reject_launch ${trigger}
      BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
    const attempt = launch(ready.revision);
    expect(await guest.emitWithAck('lobby:action', attempt)).toEqual({ ok: false, error: 'host-required' });
    expect(random).not.toHaveBeenCalled();
    expect(await host.emitWithAck('lobby:action', attempt)).toEqual({ ok: false, error: 'unavailable' });
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
    expect(success(await host.emitWithAck('lobby:resume', created.session))).toEqual(ready);
    expect(databaseContents(db)).toEqual(before);
    expect(update).not.toHaveBeenCalled();
    db.exec('DROP TRIGGER reject_launch');
    random.mockReturnValue(0.99);
    const { view, received: [guestView] } = await actionWithUpdates(host, [guest], attempt);
    expect(view.preparation?.regionScores.placements[0].pointsByRound).toEqual({ 1: 2, 2: 6, 3: 10 });
    expect(view.preparation?.twoPlayerSetup?.revealedQuestTitle).toBe('Peindre les roses');
    expect(view.preparation?.firstBattle).toEqual(firstBattle(3, 'foret-de-tulgey'));
    expect(random).toHaveBeenCalledTimes(2 * launchDraws(2));
    expect(JSON.parse(String(databaseContents(db).rooms[0].snapshot)).centralReserves).toEqual(expectedCentralReserves(25, 3));
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
    const state = legacyV8(lobbyState.parse(JSON.parse(String(saved.rooms[0].snapshot))));
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
    for (const version of [4, 5, 6, 7, 8]) {
      db.exec(`PRAGMA user_version = ${version}`);
      for (const [reason, patch] of Object.entries(corrupt)) {
        if (version === 4 && reason === 'inventaire absent') continue; // Only v4 allows a backfill.
        const legacyWithoutInventory = version === 4 && 'game' in patch && patch.game !== null;
        db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify({ ...state, version, ...patch,
          twoPlayerSetup: version >= 6 ? state.twoPlayerSetup : undefined,
          firstBattleRoll: version >= 7 ? state.firstBattleRoll : undefined,
          individualResources: version >= 8 ? state.individualResources : undefined,
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
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
    expect(JSON.parse(String(db.prepare('SELECT snapshot FROM lobbies').get()?.snapshot)))
      .toEqual({ ...snapshot, version: 10, firstPlayerId: null, game: null, regionScores: null, initialQuests: null, firstBattleRoll: null, individualResources: null, centralReserves: null });
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
    const { game, regionScores, initialQuests, firstBattleRoll, individualResources, centralReserves, ...open } = lobbyState.parse(JSON.parse(String(databaseContents(db).rooms[0].snapshot)));
    expect(game).toBeNull();
    expect(regionScores).toBeNull();
    expect(initialQuests).toBeNull();
    expect(firstBattleRoll).toBeNull();
    expect(individualResources).toBeNull();
    expect(centralReserves).toBeNull();
    const snapshot = { ...open, version: 3 };
    db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify(snapshot));
    db.exec('PRAGMA user_version = 3');
    const before = databaseContents(db);

    const random = vi.fn(() => 0);
    const url = await start(database, random);
    const after = databaseContents(db);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
    expect(JSON.parse(String(after.rooms[0].snapshot))).toEqual({ ...snapshot, version: 10, game: null, regionScores: null, initialQuests: null, firstBattleRoll: null, individualResources: null, centralReserves: null });
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
      const { regionScores, twoPlayerSetup: _, firstBattleRoll: _roll, individualResources: _holdings, ...rest } = legacyV8(lobbyState.parse(JSON.parse(String(snapshot))));
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
    const migrationDraws = 5 + 2 * (29 + 1 + 2 * bagDraws(2));
    expect(random).toHaveBeenCalledTimes(migrationDraws);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
    const migrated = databaseContents(db);
    expect(migrated.sessions).toEqual(before.sessions);
    expect(migrated.receipts).toEqual(before.receipts);
    migrated.rooms.forEach(({ snapshot }, i) => { const old = fixtures[i]; expectUpgrade(lobbyState.parse(JSON.parse(String(snapshot))), lobbySnapshotV8.parse({
      ...old, version: 8, regionScores: old.regionScores ?? (old.game ? expectedInventory : null),
      twoPlayerSetup: old.game ? expectedQuestSnapshot : null,
      firstBattleRoll: old.game ? rollOfOne : null,
      individualResources: expectedHoldings(old, () => 0),
    }), 0); });

    const [h, g, retained, waiting] = await Promise.all(Array.from({ length: 4 }, () => connect(migratedUrl)));
    const prepared = success(await h.emitWithAck('lobby:resume', missing.created.session));
    const migratedSetup = { twoPlayerSetup: expectedReveal, firstBattle: firstBattle(1, 'comte-de-la-deraison') };
    expect(publicPreparation(prepared)).toEqual({ ...publicPreparation(missingBefore),
      regionScores: { placements: expectedActivePlacements }, ...migratedSetup });
    const guestView = success(await g.emitWithAck('lobby:resume', missing.joined.session));
    expect(publicPreparation(guestView)).toEqual(publicPreparation(prepared));
    expect(success(await h.emitWithAck('lobby:action', missingAction))).toEqual(prepared);
    expect(success(await h.emitWithAck('lobby:action', missing.choice))).toEqual(prepared);
    expect(success(await g.emitWithAck('lobby:action', missing.edits[1].ready))).toEqual(guestView);
    const retainedView = success(await retained.emitWithAck('lobby:resume', existing.created.session));
    expect(publicPreparation(retainedView)).toEqual({ ...publicPreparation(existingBefore), ...migratedSetup });
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

it('annule la chaîne vers v10 si l’écriture des Quêtes échoue à l’étape v8 → v9', async () => {
  const database = tempDatabase();
  const { host, ready } = await readyTable(await start(database));
  success(await host.emitWithAck('lobby:action', launch(ready.revision)));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const { regionScores, twoPlayerSetup: _, firstBattleRoll: _roll, individualResources: _holdings, ...snapshot } = legacyV8(lobbyState.parse(JSON.parse(String(databaseContents(db).rooms[0].snapshot))));
    expect(regionScores).not.toBeNull();
    db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify({ ...snapshot, version: 4 }));
    const before = databaseContents(db);
    db.exec(`PRAGMA user_version = 4;
      CREATE TRIGGER reject_migration BEFORE UPDATE ON lobbies WHEN json_extract(NEW.snapshot, '$.version') = 9
      BEGIN SELECT RAISE(ABORT, 'test migration rollback'); END`);
    const random = vi.fn(() => 0);
    expect(() => makeServer({ database, random })).toThrow('test migration rollback');
    expect(random).toHaveBeenCalledTimes(launchDraws(2));
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
    expect(databaseContents(db)).toEqual(before);
    db.exec('DROP TRIGGER reject_migration');
    await start(database, random);
    expect(random).toHaveBeenCalledTimes(2 * launchDraws(2));
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
  } finally { db.close(); }
});

it('migre v5 avec un seul mélange de Quêtes par préparation, sans remélanger les marqueurs', async () => {
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
      const { twoPlayerSetup: _, firstBattleRoll: _roll, individualResources: _holdings, ...rest } = legacyV8(lobbyState.parse(JSON.parse(String(snapshot))));
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
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
    expect(migrated.sessions).toEqual(before.sessions);
    expect(migrated.receipts).toEqual(before.receipts);
    migrated.rooms.forEach(({ snapshot }, i) => { const fixture = v5[i]; expectUpgrade(lobbyState.parse(JSON.parse(String(snapshot))), lobbySnapshotV8.parse({
      ...fixture, version: 8, twoPlayerSetup: fixture === launched2J ? expectedQuestSnapshot : null,
      firstBattleRoll: fixture.game ? rollOfOne : null,
      individualResources: expectedHoldings(fixture, () => 0),
    }), 0); });
    expect(random).toHaveBeenCalledTimes(29 + 4 + drawsForAllSizes + newQuestDrawsForAllSizes);

    for (let reopen = 0; reopen < 2; reopen++) {
      await stop();
      const url = await start(database, random);
      for (const { action, view, count, created, joined, choice } of tables) {
        const [host, guest] = await Promise.all([connect(url), connect(url)]);
        const prepared = success(await host.emitWithAck('lobby:resume', created.session));
        const guestView = success(await guest.emitWithAck('lobby:resume', joined.session));
        const expected = action ? { ...publicPreparation(view),
          twoPlayerSetup: count === 2 ? expectedReveal : null,
          firstBattle: firstBattle(1, count === 2 ? 'comte-de-la-deraison' : 'foret-de-tulgey'),
        } : null;
        expect(publicPreparation(prepared)).toEqual(expected);
        expect(publicPreparation(guestView)).toEqual(expected);
        const update = vi.fn();
        guest.on('lobby:update', update);
        expect(success(await host.emitWithAck('lobby:action', action ?? choice))).toEqual(prepared);
        expect(success(await guest.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
        expect(update).not.toHaveBeenCalled();
        expectFiltered(prepared, created.session.token, joined.session.token);
        expectFiltered(guestView, created.session.token, joined.session.token);
      }
      expect(databaseContents(db)).toEqual(migrated);
      expect(random).toHaveBeenCalledTimes(29 + 4 + drawsForAllSizes + newQuestDrawsForAllSizes);
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
      const { firstBattleRoll: _, individualResources: _holdings, ...rest } = legacyV8(lobbyState.parse(JSON.parse(String(snapshot))), questIds);
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
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
    expect(migrated.sessions).toEqual(before.sessions);
    expect(migrated.receipts).toEqual(before.receipts);
    expect(migrated.rooms.map(({ code }) => code)).toEqual(before.rooms.map(({ code }) => code));
    migrated.rooms.forEach(({ snapshot }, i) => { const fixture = fixtures[i]; expectUpgrade(lobbyState.parse(JSON.parse(String(snapshot))), lobbySnapshotV8.parse({
      ...fixture, version: 8, firstBattleRoll: fixture.game ? { dieVersion: 1, result: 2 } : null,
      individualResources: expectedHoldings(fixture, () => 0.5),
    }), 0.5); });

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
        expect(publicPreparation(guestView)).toEqual(publicPreparation(restored));
        expect(success(await host.emitWithAck('lobby:action', action))).toEqual(restored);
        expect(success(await guest.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
        expect(update).not.toHaveBeenCalled();
        expectFiltered(restored, created.session.token, joined.session.token);
        expectFiltered(guestView, created.session.token, joined.session.token);
      }
      expect(random).toHaveBeenCalledTimes(4 + drawsForAllSizes + newQuestDrawsForAllSizes);
      expect(databaseContents(db)).toEqual(migrated);
      if (reopen === 0) {
        await stop();
        migratedUrl = await start(database, random);
      }
    }
  } finally { db.close(); }
});

it('migre v7 → v8 sans rejouer les tirages communs, et annule toutes les écritures si la deuxième dotation échoue', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0.99);
  const waiting = await readyTable(url);
  const launched: (typeof waiting & { request: ReturnType<typeof launch>; view: LobbyView })[] = [];
  for (const count of [2, 3, 4, 5]) {
    const table = await readyTable(url, count);
    const request = launch(table.ready.revision);
    const view = success(await table.host.emitWithAck('lobby:action', request));
    launched.push({ ...table, request, view });
  }
  await stop();

  const db = new DatabaseSync(database);
  try {
    const write = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    const fixtures = databaseContents(db).rooms.map(({ snapshot }) => {
      const { individualResources: _, ...rest } = legacyV8(lobbyState.parse(JSON.parse(String(snapshot))), questIds);
      const old = lobbySnapshotV7.parse({ ...rest, version: 7 });
      write.run(JSON.stringify(old), old.code);
      return old;
    });
    db.exec(`PRAGMA user_version = 7;
      CREATE TRIGGER reject_second_grant BEFORE UPDATE ON lobbies
      WHEN json_type(NEW.snapshot, '$.individualResources') = 'array' AND EXISTS (
        SELECT 1 FROM lobbies WHERE json_type(snapshot, '$.individualResources') = 'array'
      ) BEGIN SELECT RAISE(ABORT, 'test v8 rollback'); END`);
    const legacy = databaseContents(db);
    const failedRandom = vi.fn(() => 0);
    expect(() => makeServer({ database, random: failedRandom })).toThrow('test v8 rollback');
    expect(failedRandom.mock.calls.length).toBeGreaterThan(45); // At least two full bags-of-seats allocations.
    expect(databaseContents(db)).toEqual(legacy);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
    db.exec('DROP TRIGGER reject_second_grant');

    const random = vi.fn(() => 0);
    const upgradedUrl = await start(database, random);
    const upgraded = databaseContents(db);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
    expect(upgraded.sessions).toEqual(legacy.sessions);
    expect(upgraded.receipts).toEqual(legacy.receipts);
    const snapshots = upgraded.rooms.map(({ snapshot }) => lobbyState.parse(JSON.parse(String(snapshot))));
    snapshots.forEach((state, i) => expectUpgrade(state, lobbySnapshotV8.parse({ ...fixtures[i], version: 8,
      individualResources: expectedHoldings(fixtures[i], () => 0) }), 0));
    expect(random).toHaveBeenCalledTimes(drawsForAllSizes + newQuestDrawsForAllSizes);
    const verifyViews = async (url: string) => {
      const waitingHost = await connect(url);
      expect(success(await waitingHost.emitWithAck('lobby:resume', waiting.created.session))).toEqual(waiting.ready);
      expect(success(await waitingHost.emitWithAck('lobby:action', waiting.choice))).toEqual(waiting.ready);
      for (const { created, joined, request, view } of launched) {
        const [host, guest] = await Promise.all([connect(url), connect(url)]);
        const restored = success(await host.emitWithAck('lobby:resume', created.session));
        const guestView = success(await guest.emitWithAck('lobby:resume', joined.session));
        expect(publicPreparation(restored)).toEqual(publicPreparation(view));
        expect(publicPreparation(guestView)).toEqual(publicPreparation(view));
        const ids = instanceIds(snapshots.find(({ code }) => code === created.session.code)!);
        expectFiltered(restored, ...ids);
        expectFiltered(guestView, ...ids);
        const update = vi.fn();
        guest.on('lobby:update', update);
        expect(success(await host.emitWithAck('lobby:action', request))).toEqual(restored);
        expect(success(await guest.emitWithAck('lobby:resume', joined.session))).toEqual(guestView);
        expect(update).not.toHaveBeenCalled();
      }
    };
    await verifyViews(upgradedUrl);
    const dataVersion = db.prepare('PRAGMA data_version').get();
    await stop();
    await verifyViews(await start(database, random));
    expect(db.prepare('PRAGMA data_version').get()).toEqual(dataVersion);
    expect(databaseContents(db)).toEqual(upgraded);
    expect(random).toHaveBeenCalledTimes(drawsForAllSizes + newQuestDrawsForAllSizes);
  } finally { db.close(); }
});

it('migre v8 → v9 sans rejouer A–I ni le retrait 2J ; rollback à la deuxième distribution', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0.99);
  const open = await readyTable(url);
  const launched = [];
  for (const count of [2, 3, 4, 5]) {
    const table = await readyTable(url, count);
    const request = launch(table.ready.revision);
    launched.push({ ...table, request, view: success(await table.host.emitWithAck('lobby:action', request)) });
  }
  await stop();

  const db = new DatabaseSync(database);
  try {
    const write = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    const fixtures = databaseContents(db).rooms.map(({ snapshot }) => legacyV8(lobbyState.parse(JSON.parse(String(snapshot))), questIds));
    for (const fixture of fixtures) write.run(JSON.stringify(fixture), fixture.code);
    db.exec(`PRAGMA user_version = 8;
      CREATE TRIGGER reject_second_j BEFORE UPDATE ON lobbies
      WHEN json_type(NEW.snapshot, '$.initialQuests') = 'object' AND EXISTS (
        SELECT 1 FROM lobbies WHERE json_type(snapshot, '$.initialQuests') = 'object'
      ) BEGIN SELECT RAISE(ABORT, 'test v9 rollback'); END`);
    const before = databaseContents(db);
    const failedRandom = vi.fn(() => 0);
    expect(() => makeServer({ database, random: failedRandom })).toThrow('test v9 rollback');
    expect(failedRandom.mock.calls.length).toBeLessThanOrEqual(58);
    expect(databaseContents(db)).toEqual(before);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(8);
    db.exec('DROP TRIGGER reject_second_j');

    const random = vi.fn(() => 0);
    const upgradedUrl = await start(database, random);
    const upgraded = databaseContents(db);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
    expect(upgraded.sessions).toEqual(before.sessions);
    expect(upgraded.receipts).toEqual(before.receipts);
    expect(random).toHaveBeenCalledTimes(newQuestDrawsForAllSizes);
    upgraded.rooms.forEach(({ snapshot }, i) => expectUpgrade(lobbyState.parse(JSON.parse(String(snapshot))), fixtures[i], 0));
    const waiting = await connect(upgradedUrl);
    expect(success(await waiting.emitWithAck('lobby:resume', open.created.session))).toEqual(open.ready);
    for (const { created, joined, request, view } of launched) {
      const [host, guest] = await Promise.all([connect(upgradedUrl), connect(upgradedUrl)]);
      const restored = success(await host.emitWithAck('lobby:resume', created.session));
      const restoredGuest = success(await guest.emitWithAck('lobby:resume', joined.session));
      expect(publicPreparation(restored)).toEqual(publicPreparation(view));
      expect(publicPreparation(restoredGuest)).toEqual(publicPreparation(view));
      if (view.players.length === 2) expect(restored).toEqual(view); // Same ID, reveal and filtered permutation.
      expect(offerOf(restored).cards.map(({ title }) => title)).not.toEqual(offerOf(restoredGuest).cards.map(({ title }) => title));
      expectFiltered(restored, created.session.token, joined.session.token);
      expectFiltered(restoredGuest, created.session.token, joined.session.token);
      expect(success(await host.emitWithAck('lobby:action', request))).toEqual(restored);
    }
    await stop();
    const dataVersion = db.prepare('PRAGMA data_version').get();
    await start(database, random);
    expect(databaseContents(db)).toEqual(upgraded);
    expect(db.prepare('PRAGMA data_version').get()).toEqual(dataVersion);
    expect(random).toHaveBeenCalledTimes(newQuestDrawsForAllSizes);
  } finally { db.close(); }
});

it('migre v9 → v10 sans hasard, en salon ouvert et avant ou après la fin de J', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0.99);
  const open = await readyTable(url);
  const launched: { sessions: Session[]; views: LobbyView[]; choices: { request: GameAction; receipt: GameReceipt }[]; launchRequest: LobbyAction }[] = [];
  for (const count of [2, 5]) {
    const { host, seats, sessions, ready } = await readyTable(url, count);
    const launchRequest = launch(ready.revision);
    const { received } = await actionWithUpdates(host, seats, launchRequest);
    // A partially completed J (2J) and a completed J with K–M visible (5J).
    const choices = [];
    for (const [i, socket] of seats.slice(0, count === 2 ? 1 : count).entries()) {
      const request = questAction(offerOf(received[i]), i % 2);
      choices.push({ request, receipt: success(await socket.emitWithAck('setup-quest:choose', request)) });
    }
    const views = await Promise.all(seats.map((socket, i) => socket.emitWithAck('lobby:resume', sessions[i]).then(success)));
    expect(views[0].preparation?.initialBets).toEqual(count === 2 ? null : FACTION_IDS.slice(1));
    launched.push({ sessions, views, choices, launchRequest });
  }
  await stop();
  const db = new DatabaseSync(database);
  try {
    const write = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    const fixtures = databaseContents(db).rooms.map(({ snapshot }) => {
      const { centralReserves: _, ...old } = lobbyState.parse(JSON.parse(String(snapshot)));
      // Valid, non-original orders prove migration never rebuilds the bags or deck.
      old.individualResources?.forEach(({ tokenZones }) => tokenZones.bag.reverse());
      old.initialQuests?.deck.reverse();
      const fixture = lobbySnapshotV9.parse({ ...old, version: 9 });
      write.run(JSON.stringify(fixture), fixture.code);
      return fixture;
    });
    db.exec(`PRAGMA user_version = 9;
      CREATE TRIGGER reject_second_stock BEFORE UPDATE ON lobbies
      WHEN EXISTS (SELECT 1 FROM lobbies WHERE json_extract(snapshot, '$.version') = 10)
      BEGIN SELECT RAISE(ABORT, 'test v10 rollback'); END`);
    const before = databaseContents(db);
    const random = vi.fn(() => { throw new Error('aucun tirage attendu en v9 ou v10'); });
    expect(() => makeServer({ database, random })).toThrow('test v10 rollback');
    expect(databaseContents(db)).toEqual(before);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 9 });
    db.exec('DROP TRIGGER reject_second_stock');

    const fixture = fixtures.find(({ game }) => game !== null)!;
    const corrupt = structuredClone(fixture);
    const bag = corrupt.individualResources![0].tokenZones.bag;
    // Same counts, but one missing instance and one duplicate: never backfill an invalid v9 bag.
    const singles = bag.filter(({ type }) => type === 'madness-single');
    singles[1].id = singles[0].id;
    for (const invalid of [corrupt, { ...fixture, game: { ...fixture.game, phase: { type: 'tea', round: 1 } } }]) {
      write.run(JSON.stringify(invalid), fixture.code);
      const persisted = databaseContents(db);
      expect(() => makeServer({ database, random })).toThrow();
      expect(databaseContents(db)).toEqual(persisted);
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 9 });
    }
    write.run(JSON.stringify(fixture), fixture.code);

    const verifyViews = async (address: string) => {
      const waiting = await connect(address);
      expect(success(await waiting.emitWithAck('lobby:resume', open.created.session))).toEqual(open.ready);
      expect(success(await waiting.emitWithAck('lobby:action', open.choice))).toEqual(open.ready);
      for (const { sessions, views, choices, launchRequest } of launched) {
        const saved = fixtures.find(({ code }) => code === sessions[0].code)!;
        for (const [i, session] of sessions.entries()) {
          const socket = await connect(address);
          const view = success(await socket.emitWithAck('lobby:resume', session));
          expect(view).toStrictEqual(views[i]);
          expectFiltered(view, ...saved.individualResources!.flatMap(({ tokenZones }) => tokenZones.bag.map(({ id }) => id)));
          const log = vi.fn();
          socket.onAny(log);
          if (i === 0) expect(success(await socket.emitWithAck('lobby:action', launchRequest))).toStrictEqual(view);
          if (choices[i]) expect(success(await socket.emitWithAck('setup-quest:choose', choices[i].request))).toStrictEqual(choices[i].receipt);
          expect(log).not.toHaveBeenCalled();
        }
      }
    };
    await verifyViews(await start(database, random));
    const upgraded = databaseContents(db);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 10 });
    expect(upgraded.sessions).toEqual(before.sessions);
    expect(upgraded.receipts).toEqual(before.receipts);
    expect(upgraded.rooms.map(({ snapshot }) => JSON.parse(String(snapshot)))).toStrictEqual(fixtures.map((old) => ({
      ...old, version: 10, centralReserves: !old.game ? null
        : old.players.length === 2 ? expectedCentralReserves(25, 3) : expectedCentralReserves(19, 0),
    })));
    const dataVersion = db.prepare('PRAGMA data_version').get();
    await stop();
    await verifyViews(await start(database, random));
    expect(databaseContents(db)).toEqual(upgraded);
    expect(db.prepare('PRAGMA data_version').get()).toEqual(dataVersion);
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('refuse des réserves v10 absentes, superflues ou non conservées, sans réécriture', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0);
  await readyTable(url);
  const { host, ready } = await readyTable(url);
  success(await host.emitWithAck('lobby:action', launch(ready.revision)));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const random = vi.fn(() => 0);
    const write = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    for (const { snapshot } of databaseContents(db).rooms) {
      const state = lobbyState.parse(JSON.parse(String(snapshot)));
      const reserves = expectedCentralReserves(25, 3);
      const invalid = state.game ? [undefined, null, expectedCentralReserves(29, 5), expectedCentralReserves(24, 4),
        expectedCentralReserves(25, -1), expectedCentralReserves(25.5, 3),
        { ...reserves, undistributedMadness: { ...reserves.undistributedMadness, poison: 0 } },
        { ...reserves, shardBank: { 1: 25, 5: 11 } }, // Correct total value, wrong denominations.
        { ...reserves, shardBank: { 1: 30, 5: 10, 10: 0 } },
        { ...reserves, firstBattleRoll: rollOfOne }, { ...reserves, balances: [] },
      ] : [undefined, reserves];
      for (const centralReserves of invalid) {
        write.run(JSON.stringify({ ...state, centralReserves }), state.code);
        const before = databaseContents(db);
        expect(() => makeServer({ database, random })).toThrow(/centralReserves/);
        expect(databaseContents(db)).toEqual(before);
        expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 10 });
      }
      write.run(JSON.stringify(state), state.code);
    }
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('refuse des zones ou preuves privées incohérentes et conserve une pioche courante valide', async () => {
  const database = tempDatabase();
  const { host, created, ready } = await readyTable(await start(database, () => 0));
  const prepared = success(await host.emitWithAck('lobby:action', launch(ready.revision)));
  const request = questAction(offerOf(prepared), 0);
  const receipt = success(await host.emitWithAck('setup-quest:choose', request));
  const view = success(await host.emitWithAck('lobby:resume', created.session));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const state = lobbyState.parse(JSON.parse(String(databaseContents(db).rooms[0].snapshot)));
    const rng = vi.fn(() => 0);
    const write = (input: unknown) => db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify(input));
    const corruptions: ((copy: LobbyState) => void)[] = [
      ({ initialQuests: q }) => { q!.deck.pop(); },
      ({ initialQuests: q }) => { q!.deck[0] = q!.deck[1]; },
      ({ initialQuests: q }) => { q!.seats.reverse(); },
      ({ initialQuests: q }) => { q!.twoPlayerOut = null; },
      ({ initialQuests: q }) => { [q!.deck[0], q!.twoPlayerOut!.removed[0]] = [q!.twoPlayerOut!.removed[0], q!.deck[0]]; },
      ({ initialQuests: q }) => {
        const [first] = q!.seats;
        if (first.type !== 'kept') throw new Error('Quête retenue attendue');
        [first.card, q!.deck[0]] = [q!.deck[0], first.card];
      },
      ({ game }) => { game!.decisions[0].optionIds.reverse(); },
      ({ game }) => { game!.history[0].actorId = randomUUID(); },
      ({ game }) => { game!.history[0].event.optionId = randomUUID(); },
    ];
    for (const corrupt of corruptions) {
      const copy = structuredClone(state);
      corrupt(copy);
      write(copy);
      const persisted = databaseContents(db);
      expect(() => makeServer({ database, random: rng })).toThrow();
      expect(databaseContents(db)).toEqual(persisted);
    }
    write({ ...state, twoPlayerSetup: expectedQuestSnapshot }); // No shadow copy of the obsolete order.
    expect(() => makeServer({ database, random: rng })).toThrow();
    state.initialQuests!.deck.reverse();
    write(state);
    const persisted = databaseContents(db);
    const returned = await connect(await start(database, rng));
    expect(success(await returned.emitWithAck('lobby:resume', created.session))).toEqual(view);
    expect(success(await returned.emitWithAck('setup-quest:choose', request))).toEqual(receipt);
    expect(databaseContents(db)).toEqual(persisted);
    expect(rng).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('refuse une dotation A–I altérée sans réparer le multiensemble, les zones ou les sièges', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0);
  const open = await readyTable(url);
  const table = await readyTable(url, 5);
  success(await table.host.emitWithAck('lobby:action', launch(table.ready.revision)));
  await stop();

  const db = new DatabaseSync(database);
  try {
    const snapshots = databaseContents(db).rooms.map(({ snapshot }) => lobbyState.parse(JSON.parse(String(snapshot))));
    const state = snapshots.find(({ code }) => code === table.created.session.code)!;
    const waiting = snapshots.find(({ code }) => code === open.created.session.code)!;
    const resources = state.individualResources!;
    const mutate = (change: (value: typeof resources) => void) => {
      const copy = structuredClone(resources);
      change(copy);
      return copy;
    };
    const invalid = [
      undefined, null, [...resources.slice(1)], resources.toReversed(),
      mutate(([seat]) => { seat.playerId = randomUUID(); }),
      mutate(([seat]) => { seat.faction = 'jabberwocky'; }),
      mutate(([seat]) => { seat.boardFace = 'golden-two-player'; }),
      mutate(([seat]) => { seat.supportersInReserve++; seat.supportersOnThirdForgeTrack--; }),
      mutate(([{ tokenZones: { bag } }]) => { bag.pop(); }),
      mutate(([{ tokenZones: { bag } }]) => { bag[0] = bag[1]; }),
      mutate(([{ tokenZones: { bag } }]) => { bag[0].id = randomUUID(); }),
      mutate(([{ tokenZones: { bag } }]) => { bag.find(({ type }) => type === 'madness-double')!.type = 'madness-single'; }),
      mutate(([{ tokenZones: first }, { tokenZones: second }]) => { first.bag[0] = second.bag[0]; }),
      mutate(([{ tokenZones: { bag, forgeRewards } }]) => {
        const i = bag.findIndex(({ type }) => type === 'artifact-3');
        [bag[i], forgeRewards[0]] = [forgeRewards[0], bag[i]];
      }),
      ...(['active', 'exhausted', 'madnessTrack'] as const).map((zone) => mutate(([{ tokenZones }]) => {
        tokenZones[zone].push(tokenZones.bag.pop()!);
      })),
      mutate((seats) => {
        const { poisonReserve, bag } = seats.find(({ faction }) => faction === 'jabberwocky')!.tokenZones;
        [poisonReserve[0], bag[0]] = [bag[0], poisonReserve[0]];
      }),
      mutate((seats) => {
        const { poisonReserve } = seats.find(({ faction }) => faction === 'jabberwocky')!.tokenZones;
        seats[0].tokenZones.poisonReserve.push(poisonReserve.pop()!);
      }),
    ];
    const random = vi.fn(() => 0);
    const write = db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?');
    for (const [snapshot, grant] of [...invalid.map((grant) => [state, grant] as const), [waiting, resources] as const]) {
      write.run(JSON.stringify({ ...snapshot, individualResources: grant }), snapshot.code);
      const before = databaseContents(db);
      expect(() => makeServer({ database, random })).toThrow(/individualResources/);
      expect(databaseContents(db)).toEqual(before);
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
      write.run(JSON.stringify(snapshot), snapshot.code);
    }
    // A different valid permutation is authoritative, not regenerated or normalized.
    const permuted = mutate(([{ tokenZones }]) => { tokenZones.bag.reverse(); });
    write.run(JSON.stringify({ ...state, individualResources: permuted }), state.code);
    const before = databaseContents(db);
    await start(database, random);
    expect(databaseContents(db)).toEqual(before);
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('ne répare jamais un lancer absent, invalide ou enregistré dans un salon ouvert', async () => {
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
        expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(10);
      }
      write.run(JSON.stringify(snapshot), snapshot.code);
    }
    expect(random).not.toHaveBeenCalled();
    const returned = await connect(await start(database, random));
    expect(success(await returned.emitWithAck('lobby:resume', open.created.session))).toEqual(open.ready);
    expect(random).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('refuse à la restauration v8 une version, des IDs, une phase ou un effectif de retrait incohérents', async () => {
  const database = tempDatabase();
  const url = await start(database, () => 0);
  const open = await readyTable(url);
  const two = await readyTable(url);
  const three = await readyTable(url, 3);
  for (const table of [two, three]) success(await table.host.emitWithAck('lobby:action', launch(table.ready.revision)));
  await stop();
  const db = new DatabaseSync(database);
  try {
    const snapshots = databaseContents(db).rooms.map(({ snapshot }) => legacyV8(lobbyState.parse(JSON.parse(String(snapshot)))));
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
      db.exec('PRAGMA user_version = 8');
      for (const fixture of snapshots) seed.run(JSON.stringify(fixture), fixture.code);
      seed.run(JSON.stringify({ ...snapshot, twoPlayerSetup: invalid }), snapshot.code);
      const saved = databaseContents(db);
      expect(() => makeServer({ database, random })).toThrow();
      expect(databaseContents(db)).toEqual(saved);
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(8);
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
      .toEqual({ ...snapshot, version: 10, game: null, regionScores: null, initialQuests: null, firstBattleRoll: null, individualResources: null, centralReserves: null,
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
