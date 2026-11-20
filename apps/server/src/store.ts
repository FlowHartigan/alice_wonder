import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createLobby, joinLobby, applyLobbyAction, launchPreparation, migrateLobbyV1, migrateLobbyV2, migrateLobbyV3, migrateLobbyV4, migrateLobbyV5, migrateLobbyV6 } from '@wonderland/game-engine';
import type { RandomSource } from '@wonderland/game-engine';
import { lobbySnapshotV5, lobbySnapshotV4, lobbyStateV1, lobbyStateV2, lobbyStateV3 } from '@wonderland/shared';
import type { LobbyAction, Reply, Session } from '@wonderland/shared';
import { lobbySnapshotV6, lobbyState } from '@wonderland/shared/lobby-storage';
import type { LobbyState } from '@wonderland/shared/lobby-storage';

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

// A multiple of six gives each face exactly the same number of discrete samples.
const randomRange = 6 * 2 ** 29;
const randomFraction: RandomSource = () => randomInt(randomRange) / randomRange;

export function openStore(path: string, random: RandomSource = randomFraction) {
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

  function restoreSnapshots(version: 1 | 2 | 3 | 4 | 5 | 6 | 7) {
    const rows = db.prepare('SELECT code, snapshot FROM lobbies').all();
    for (const row of rows) {
      const raw: unknown = JSON.parse(String(row.snapshot));
      if (version === 1) {
        const old = lobbyStateV1.parse(raw);
        if (old.code !== row.code) throw new Error('Code du salon incohérent dans le snapshot v1');
        writeSnapshot(lobbyStateV2.parse(migrateLobbyV1(old)));
      } else if (version === 2) {
        const old = lobbyStateV2.parse(raw);
        if (old.code !== row.code) throw new Error('Code du salon incohérent dans le snapshot v2');
        writeSnapshot(lobbyStateV3.parse(migrateLobbyV2(old)));
      } else if (version === 3) {
        const old = lobbyStateV3.parse(raw);
        if (old.code !== row.code) throw new Error('Code du salon incohérent dans le snapshot v3');
        writeSnapshot(lobbySnapshotV4.parse(migrateLobbyV3(old)));
      } else if (version === 4) {
        const old = lobbySnapshotV4.parse(raw);
        if (old.code !== row.code) throw new Error('Code du salon incohérent dans le snapshot v4');
        writeSnapshot(lobbySnapshotV5.parse(migrateLobbyV4(old, random)));
      } else if (version === 5) {
        const old = lobbySnapshotV5.parse(raw);
        if (old.code !== row.code) throw new Error('Code du salon incohérent dans le snapshot v5');
        writeSnapshot(lobbySnapshotV6.parse(migrateLobbyV5(old, random)));
      } else if (version === 6) {
        const old = lobbySnapshotV6.parse(raw);
        if (old.code !== row.code) throw new Error('Code du salon incohérent dans le snapshot v6');
        save(migrateLobbyV6(old, random));
      } else {
        const snapshot = lobbyState.parse(raw);
        if (snapshot.code !== row.code) throw new Error('Code du salon incohérent dans le snapshot v7');
      }
    }
  }

  try {
    transaction(() => {
      const version = db.prepare('PRAGMA user_version').get()?.user_version;
      if (version !== 0 && version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7) {
        throw new Error('Version de base non prise en charge');
      }
      if (version === 0) db.exec(migration1);
      if (version === 0 || version === 1) restoreSnapshots(1);
      if (version <= 2) restoreSnapshots(2);
      if (version <= 3) restoreSnapshots(3);
      if (version <= 4) restoreSnapshots(4);
      if (version <= 5) restoreSnapshots(5);
      if (version === 7) restoreSnapshots(7);
      else {
        restoreSnapshots(6);
        // Preserve sessions and successful action fingerprints through all steps.
        db.exec('PRAGMA user_version = 7');
      }
    });
  } catch (error) {
    db.close();
    throw error;
  }

  function load(code: string): LobbyState | undefined {
    const row = db.prepare('SELECT snapshot FROM lobbies WHERE code = ?').get(code);
    return row ? lobbyState.parse(JSON.parse(String(row.snapshot))) : undefined;
  }

  function writeSnapshot(state: { code: string }) {
    db.prepare('UPDATE lobbies SET snapshot = ? WHERE code = ?').run(JSON.stringify(state), state.code);
  }

  function save(state: LobbyState) {
    writeSnapshot(lobbyState.parse(state));
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
        const state = lobbyState.parse(createLobby(code, { id: playerId, name }));
        db.prepare('INSERT INTO lobbies VALUES (?, ?)').run(code, JSON.stringify(state));
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
      if (!row) return;
      const state = load(session.code);
      const playerId = String(row.player_id);
      if (state?.players.some(({ id }) => id === playerId)) return { state, playerId };
    },
    action(seat: Seat, action: LobbyAction): Reply<{ state: LobbyState; changed: boolean }> {
      return transaction(() => {
        const state = load(seat.code);
        if (!state) return { ok: false, error: 'room-not-found' };
        const args = [seat.code, seat.playerId, action.actionId] as const;
        const previous = db.prepare(
          'SELECT intent FROM accepted_actions WHERE code = ? AND player_id = ? AND action_id = ?',
        ).get(...args);
        // Preserve the v1 encoding for set-ready so accepted_actions still deduplicates it.
        const parameter = action.type === 'set-ready' ? action.ready
          : action.type === 'select-faction' ? action.faction
          : action.type === 'select-first-player' ? action.firstPlayerId : '';
        const intent = `${action.type}:${parameter}:${action.expectedRevision}`;
        if (previous) return previous.intent === intent
          ? { ok: true, value: { state, changed: false } }
          : { ok: false, error: 'conflict' };
        const result = action.type === 'launch-preparation'
          ? launchPreparation(state, seat.playerId, action.expectedRevision, randomUUID, random)
          : applyLobbyAction(state, seat.playerId, action);
        if (!result.ok) return result;
        const changed = result.value !== state;
        if (changed) save(result.value);
        db.prepare('INSERT INTO accepted_actions VALUES (?, ?, ?, ?)').run(...args, intent);
        return { ok: true, value: { state: result.value, changed } };
      });
    },
  };
}
