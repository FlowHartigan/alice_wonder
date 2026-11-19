import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { makeServer } from '../apps/server/src/server.ts';
import { applyLobbyAction, createLobby, joinLobby, normalizeFirstPlayer } from '@wonderland/game-engine';
import { FACTION_IDS, lobbyState } from '@wonderland/shared';
import type { ClientEvents, FactionId, LobbyView, Reply, ServerEvents } from '@wonderland/shared';

const clients: Socket<ServerEvents, ClientEvents>[] = [];
let server: ReturnType<typeof makeServer> | undefined;
let directory: string | undefined;

async function start(database = ':memory:') {
  server = makeServer({ database });
  const listening = once(server.http, 'listening');
  server.http.listen(0, '127.0.0.1');
  await listening;
  const address = server.http.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  return `http://127.0.0.1:${address.port}`;
}

async function connect(url: string) {
  const socket: Socket<ServerEvents, ClientEvents> = io(url, {
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

function nextUpdate(socket: Socket<ServerEvents, ClientEvents>) {
  return new Promise<LobbyView>((resolve) => socket.once('lobby:update', resolve));
}

function success<T>(reply: Reply<T>): T {
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}

const selectFaction = (faction: FactionId, expectedRevision: number) =>
  ({ actionId: randomUUID(), type: 'select-faction', faction, expectedRevision } as const);
const setReady = (ready: boolean, expectedRevision: number) =>
  ({ actionId: randomUUID(), type: 'set-ready', ready, expectedRevision } as const);
const selectFirstPlayer = (firstPlayerId: string, expectedRevision: number) =>
  ({ actionId: randomUUID(), type: 'select-first-player', firstPlayerId, expectedRevision } as const);
const ownSeat = (view: LobbyView) => view.players.find((p) => p.id === view.you);
const available = (view: LobbyView) => view.factions.filter((f) => f.status === 'available').map((f) => f.id);

function tempDatabase() {
  directory = mkdtempSync(join(tmpdir(), 'ww-test-'));
  return join(directory, 'test.sqlite');
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

it('synchronise cinq factions uniques et garde les jetons de session hors des vues', async () => {
  const url = await start();
  const host = await connect(url);
  const created = success(await host.emitWithAck('lobby:create', { name: 'Alice' }));
  const { code, token } = created.session;
  const guest = await connect(url);
  const receivedJoin = nextUpdate(host);
  const joined = success(await guest.emitWithAck('lobby:join', { code, name: 'Dinah' }));
  expect(await receivedJoin).toEqual({ ...joined.view, you: created.view.you, canSelectFirstPlayer: true });
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
  expect(await update).toEqual({ ...selected, you: joined.view.you, canSelectFirstPlayer: false });
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
    .toEqual({ ...finalChoice, you: joined.view.you, canSelectFirstPlayer: false });
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
  const url = await start(database);
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
  const returned = await connect(await start(database));
  expect(success(await returned.emitWithAck('lobby:resume', hostSession))).toEqual(picked);
  expect(success(await returned.emitWithAck('lobby:action', ready))).toEqual(picked);
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

    const url = await start(database);
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(3);
    expect(JSON.parse(String(db.prepare('SELECT snapshot FROM lobbies').get()?.snapshot)))
      .toEqual({ ...snapshot, version: 3, firstPlayerId: null });
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
    const snapshot = JSON.parse(String(db.prepare('SELECT snapshot FROM lobbies').get()?.snapshot));
    snapshot.players = selected.players.filter(({ id }) => id !== view.you);
    db.prepare('UPDATE lobbies SET snapshot = ?').run(JSON.stringify(snapshot));
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
      .toEqual({ ...snapshot, firstPlayerId: null, revision: restored.revision, journal: restored.journal });
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
