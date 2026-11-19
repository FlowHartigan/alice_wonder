import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { afterEach, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { makeServer } from '../apps/server/src/server.ts';
import { applyLobbyAction, createLobby, joinLobby } from '@wonderland/game-engine';
import type { ClientEvents, LobbyView, Reply, ServerEvents } from '@wonderland/shared';

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
  const action = { actionId: randomUUID(), type: 'set-ready', ready: true, expectedRevision: state.revision } as const;
  expect(applyLobbyAction(newer, randomUUID(), action)).toEqual({ ok: false, error: 'unauthorized' });
  expect(applyLobbyAction(newer, host.id, action)).toEqual({ ok: false, error: 'conflict' });
  expect(state.players).toHaveLength(1);
  expect(newer.players.every((p) => !p.ready)).toBe(true);
});

it('synchronise cinq joueurs et garde le jeton de session hors des vues publiques', async () => {
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
  const action = { actionId: randomUUID(), type: 'set-ready', ready: true, expectedRevision: 5 } as const;
  expect(await outsider.emitWithAck('lobby:action', action)).toEqual({ ok: false, error: 'unauthorized' });
  expect(await guest.emitWithAck('lobby:action', { ...action, actorId: created.view.you } as typeof action)).toEqual({ ok: false, error: 'invalid' });
  const changed = success(await guest.emitWithAck('lobby:action', action));
  expect(changed.players).toHaveLength(5);
  expect(changed.players.filter((p) => p.ready).map((p) => p.name)).toEqual(['Dinah']);
  for (const view of await updates) expect(view.revision).toBe(changed.revision);
});

it('conserve la place, le statut et l’idempotence après réouverture de la base', async () => {
  directory = mkdtempSync(join(tmpdir(), 'ww-test-'));
  const database = join(directory, 'test.sqlite');
  const host = await connect(await start(database));
  const { session, view } = success(await host.emitWithAck('lobby:create', { name: 'Alice' }));
  const action = { actionId: randomUUID(), type: 'set-ready', ready: true, expectedRevision: view.revision } as const;
  const ready = success(await host.emitWithAck('lobby:action', action));
  host.disconnect();
  await server?.close();
  server = undefined;

  const returned = await connect(await start(database));
  expect(success(await returned.emitWithAck('lobby:resume', session))).toEqual(ready);
  expect(success(await returned.emitWithAck('lobby:action', action))).toEqual(ready);
  expect(await returned.emitWithAck('lobby:action', { ...action, ready: false })).toEqual({ ok: false, error: 'conflict' });
});
