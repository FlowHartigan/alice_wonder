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
import { applyLobbyAction, createLobby, joinLobby } from '@wonderland/game-engine';
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
const ownSeat = (view: LobbyView) => view.players.find((p) => p.id === view.you);
const available = (view: LobbyView) => view.factions.filter((f) => f.status === 'available').map((f) => f.id);

function tempDatabase() {
  directory = mkdtempSync(join(tmpdir(), 'ww-test-'));
  return join(directory, 'test.sqlite');
}

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.disconnect();
  await server?.close();
  server = undefined;
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

it('synchronise cinq factions uniques et garde les jetons de session hors des vues', async () => {
  const url = await start();
  const host = await connect(url);
  const created = success(await host.emitWithAck('lobby:create', { name: 'Alice' }));
  const { code, token } = created.session;
  const guest = await connect(url);
  const receivedJoin = nextUpdate(host);
  const joined = success(await guest.emitWithAck('lobby:join', { code, name: 'Dinah' }));
  expect(await receivedJoin).toEqual({ ...joined.view, you: created.view.you });
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
  await server?.close();
  server = undefined;

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
    code: snapshot.code, hostId: snapshot.hostId, you: snapshot.hostId, revision: 4, canSetReady: false,
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
  await server?.close();
  server = undefined;
  const returned = await connect(await start(database));
  expect(success(await returned.emitWithAck('lobby:resume', hostSession))).toEqual(picked);
  expect(success(await returned.emitWithAck('lobby:action', ready))).toEqual(picked);
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
