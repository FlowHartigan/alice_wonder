import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import type { ZodType } from 'zod';
import { viewFor } from '@wonderland/game-engine';
import type { RandomSource } from '@wonderland/game-engine';
import { createInput, joinInput, credentials, gameAction, lobbyAction } from '@wonderland/shared';
import type { ClientEvents, Reply, ServerEvents } from '@wonderland/shared';
import type { LobbyState } from '@wonderland/shared/lobby-storage';
import { openStore } from './store.ts';
import type { Seat } from './store.ts';

function handler<Input, Output>(schema: ZodType<Input>, operation: (input: Input) => Reply<Output>) {
  return (raw: unknown, ack: (reply: Reply<Output>) => void) => {
    if (typeof ack !== 'function') return;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return ack({ ok: false, error: 'invalid' });
    let reply: Reply<Output>;
    try {
      reply = operation(parsed.data);
    } catch (error) {
      console.error('Échec du traitement du salon', error instanceof Error ? error.name : 'inconnu');
      reply = { ok: false, error: 'unavailable' };
    }
    ack(reply);
  };
}

export function makeServer(options: { database: string; webRoot?: string; publicOrigin?: string; random?: RandomSource }) {
  const store = openStore(options.database, options.random);
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ ok: true }));
  if (options.webRoot) app.use(express.static(options.webRoot));
  const http = createServer(app);
  const io = new Server<ClientEvents, ServerEvents, Record<never, never>, { seat?: Seat }>(http, {
    maxHttpBufferSize: 4096,
    allowRequest: ({ headers }, callback) => {
      const origin = headers.origin;
      const allowed = origin === undefined || (options.publicOrigin
        ? origin === options.publicOrigin
        : origin === `http://${headers.host}` || origin === `https://${headers.host}`);
      callback(null, allowed);
    },
  });

  const channel = (code: string) => `lobby:${code}`;
  function publish(state: LobbyState) {
    for (const socketId of io.of('/').adapter.rooms.get(channel(state.code)) ?? []) {
      const target = io.of('/').sockets.get(socketId);
      const seat = target?.data.seat;
      if (seat?.code === state.code) target?.emit('lobby:update', viewFor(state, seat.playerId));
    }
  }

  io.on('connection', (socket) => {
    function bind(state: LobbyState, playerId: string) {
      socket.data.seat = { code: state.code, playerId };
      // The in-process adapter joins synchronously before publication.
      void socket.join(channel(state.code));
      return viewFor(state, playerId);
    }

    socket.on('lobby:create', handler(createInput, ({ name }) => {
      if (socket.data.seat) return { ok: false, error: 'already-seated' };
      const { state, playerId, session } = store.create(name);
      return { ok: true, value: { session, view: bind(state, playerId) } };
    }));
    socket.on('lobby:join', handler(joinInput, ({ code, name }) => {
      if (socket.data.seat) return { ok: false, error: 'already-seated' };
      const result = store.join(code, name);
      if (!result.ok) return result;
      const { state, playerId, session } = result.value;
      const view = bind(state, playerId);
      publish(state);
      return { ok: true, value: { session, view } };
    }));
    socket.on('lobby:resume', handler(credentials, (session) => {
      const result = store.resume(session);
      if (!result) return { ok: false, error: 'unauthorized' };
      const { state, playerId } = result;
      const seat = socket.data.seat;
      if (seat && (seat.code !== state.code || seat.playerId !== playerId)) {
        return { ok: false, error: 'already-seated' };
      }
      return { ok: true, value: bind(state, playerId) };
    }));
    socket.on('lobby:action', handler(lobbyAction, (action) => {
      const seat = socket.data.seat;
      if (!seat) return { ok: false, error: 'unauthorized' };
      const result = store.action(seat, action);
      if (!result.ok) return result;
      if (result.value.changed) publish(result.value.state);
      return { ok: true, value: viewFor(result.value.state, seat.playerId) };
    }));
    socket.on('setup-quest:choose', handler(gameAction, (action) => {
      const seat = socket.data.seat;
      if (!seat) return { ok: false, error: 'unauthorized' };
      const result = store.chooseQuest(seat, action);
      if (!result.ok) return result;
      const { update, receipt } = result.value;
      if (update) {
        for (const socketId of io.of('/').adapter.rooms.get(channel(seat.code)) ?? []) {
          const target = io.of('/').sockets.get(socketId);
          const recipient = target?.data.seat;
          if (target && recipient?.code === seat.code && recipient.playerId === seat.playerId) target.emit('setup-quest:update', update);
        }
      }
      return { ok: true, value: receipt };
    }));
  });

  return { http, close: async () => { await io.close(); store.close(); } };
}
