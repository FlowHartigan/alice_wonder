import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createLobby, joinLobby, applyLobbyAction } from '@wonderland/game-engine';
import { lobbyState } from '@wonderland/shared';
import type { LobbyAction, LobbyState, Reply, Session } from '@wonderland/shared';

export type Seat = { code: string; playerId: string };
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const migration1 = `
  CREATE TABLE lobbies (code TEXT PRIMARY KEY, snapshot TEXT NOT NULL) STRICT;
  CREATE TABLE sessions (
    code TEXT NOT NULL REFERENCES lobbies(code), player_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, PRIMARY KEY (code, player_id)
  ) STRICT;
  CREATE TABLE accepted_actions (
    code TEXT NOT NULL, player_id TEXT NOT NULL, action_id TEXT NOT NULL, intent TEXT NOT NULL,
    PRIMARY KEY (code, player_id, action_id),
    FOREIGN KEY (code, player_id) REFERENCES sessions(code, player_id)
  ) STRICT;
  PRAGMA user_version = 1;
`;

export function openStore(path: string) {
  const db = new DatabaseSync(path);

  function transaction<T>(operation: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const version = db.prepare('PRAGMA user_version').get()?.user_version;
  if (version === 0) transaction(() => db.exec(migration1));
  else if (version !== 1) {
    db.close();
    throw new Error('Version de base non prise en charge');
  }

  function load(code: string): LobbyState | undefined {
    const row = db.prepare('SELECT snapshot FROM lobbies WHERE code = ?').get(code);
    return row ? lobbyState.parse(JSON.parse(String(row.snapshot))) : undefined;
  }

  function save(state: LobbyState) {
    db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?').run(
      JSON.stringify(lobbyState.parse(state)), state.code,
    );
  }

  function admit(state: LobbyState, playerId: string) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(state.code, playerId, hashToken(token));
    return { state, playerId, session: { code: state.code, token } };
  }

  return {
    close: () => db.close(),
    create(name: string) {
      return transaction(() => {
        let code: string;
        do { code = randomBytes(4).toString('hex').toUpperCase(); } while (load(code));
        const playerId = randomUUID();
        const state = createLobby(code, { id: playerId, name });
        db.prepare('INSERT INTO lobbies VALUES (?, ?)').run(code, JSON.stringify(lobbyState.parse(state)));
        return admit(state, playerId);
      });
    },
    join(code: string, name: string): Reply<ReturnType<typeof admit>> {
      return transaction(() => {
        const state = load(code);
        if (!state) return { ok: false, error: 'room-not-found' };
        const playerId = randomUUID();
        const result = joinLobby(state, { id: playerId, name });
        if (!result.ok) return result;
        save(result.value);
        return { ok: true, value: admit(result.value, playerId) };
      });
    },
    resume(session: Session) {
      const row = db.prepare('SELECT player_id FROM sessions WHERE code = ? AND token_hash = ?').get(
        session.code, hashToken(session.token),
      );
      const state = row && load(session.code);
      return row && state ? { state, playerId: String(row.player_id) } : undefined;
    },
    action(seat: Seat, action: LobbyAction): Reply<{ state: LobbyState; changed: boolean }> {
      return transaction(() => {
        const state = load(seat.code);
        if (!state) return { ok: false, error: 'room-not-found' };
        const args = [seat.code, seat.playerId, action.actionId] as const;
        const previous = db.prepare(
          'SELECT intent FROM accepted_actions WHERE code = ? AND player_id = ? AND action_id = ?',
        ).get(...args);
        const intent = `${action.type}:${action.ready}:${action.expectedRevision}`;
        if (previous) return previous.intent === intent
          ? { ok: true, value: { state, changed: false } }
          : { ok: false, error: 'conflict' };
        const result = applyLobbyAction(state, seat.playerId, action);
        if (!result.ok) return result;
        const changed = result.value !== state;
        if (changed) save(result.value);
        db.prepare('INSERT INTO accepted_actions VALUES (?, ?, ?, ?)').run(...args, intent);
        return { ok: true, value: { state: result.value, changed } };
      });
    },
  };
}
