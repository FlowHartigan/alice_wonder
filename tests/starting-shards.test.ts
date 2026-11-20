import { expect, it } from 'vitest';
import { createLobby, launchPreparation, transferStartingShards } from '@wonderland/game-engine';
import type { GamePhase } from '@wonderland/shared';

const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ready = {
  status: 'pending', phase: { type: 'setup' }, playerIds: [id(1), id(2)], firstPlayerId: id(2),
  stepsJThroughMComplete: true, commonSetupReady: true,
} as const;

it.each([
  { count: 2, clockwise: [2, 1], shards: [2, 1], remaining: 27 },
  { count: 3, clockwise: [3, 1, 2], shards: [3, 2, 1], remaining: 24 },
  { count: 4, clockwise: [4, 1, 2, 3], shards: [3, 2, 2, 1], remaining: 22 },
  { count: 5, clockwise: [5, 1, 2, 3, 4], shards: [3, 2, 2, 1, 0], remaining: 22 },
])('WW-SETUP-005 : transfert à $count sièges, depuis Alice non hôte', ({ count, clockwise, shards, remaining }) => {
  const factions = ['chapelier-fou', 'reine-de-coeur', 'jabberwocky', 'chat-du-cheshire', 'alice'] as const;
  const players = [...factions.slice(0, count - 1), factions[4]].map((faction, i) => ({
    id: id(i + 1), name: `Siège ${i + 1}`, ready: true, faction,
  }));
  const firstPlayerId = players[count - 1].id;
  const lobby = { ...createLobby('ABCDEF12', players[0]), players, firstPlayerId };
  const launch = launchPreparation(lobby, lobby.hostId, lobby.revision, () => id(9), () => 0.5);
  if (!launch.ok || !launch.value.game) throw new Error('Préparation non lancée');
  const { phase, playerIds } = launch.value.game;
  // The barriers are explicit test inputs, not signals derived from launch or J.
  const input = Object.freeze({ ...ready, phase: Object.freeze(phase), playerIds: Object.freeze(playerIds), firstPlayerId });
  const copy = structuredClone(input);
  const result = transferStartingShards(input);
  if (!result) throw new Error('Transfert refusé');

  expect(result.before).toStrictEqual({
    bank: { 1: 30, 5: 10 },
    balances: clockwise.map((seat) => ({ playerId: id(seat), pieces: { 1: 0, 5: 0 } })),
  });
  expect(result.after).toStrictEqual({
    bank: { 1: remaining, 5: 10 },
    balances: clockwise.map((seat, i) => ({ playerId: id(seat), pieces: { 1: shards[i], 5: 0 } })),
  });
  for (const snapshot of [result.before, result.after]) {
    const countPieces = (value: 1 | 5) => snapshot.bank[value]
      + snapshot.balances.reduce((sum, { pieces }) => sum + pieces[value], 0);
    expect(countPieces(1)).toBe(30);
    expect(countPieces(5)).toBe(10);
    expect(countPieces(1) + 5 * countPieces(5)).toBe(80);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.balances)).toBe(true);
    expect(Reflect.set(snapshot.bank, 1, 0)).toBe(false);
    for (const balance of snapshot.balances) {
      expect(Object.isFrozen(balance)).toBe(true);
      expect(Reflect.set(balance.pieces, 1, 99)).toBe(false);
    }
  }
  expect(Object.isFrozen(result)).toBe(true);
  expect(transferStartingShards(result)).toBe(result);
  expect(transferStartingShards(input)).toStrictEqual(result);
  expect(input).toStrictEqual(copy);
});

it('WW-SETUP-005 : exige chaque barrière séparément', () => {
  expect(transferStartingShards({ ...ready, stepsJThroughMComplete: false })).toBeNull();
  expect(transferStartingShards({ ...ready, commonSetupReady: false })).toBeNull();
  expect(transferStartingShards(ready)).not.toBeNull();
});

it('WW-SETUP-005 : refuse le transfert hors setup, y compris aux rounds II et III', () => {
  for (const type of ['tea', 'war'] as const) {
    for (const round of [1, 2, 3] as const) {
      const phase: GamePhase = { type, round };
      expect(transferStartingShards({ ...ready, phase })).toBeNull();
    }
  }
});

it('WW-SETUP-005 : refuse un roster ou un J1 incohérent sans effet partiel', () => {
  for (const playerIds of [[], [id(2)], [id(2), id(2)], [id(2), id(1).toUpperCase()], [id(2), ''],
    [id(1), id(2), id(3), id(4), id(5), id(6)]]) {
    expect(transferStartingShards({ ...ready, playerIds: Object.freeze(playerIds) })).toBeNull();
  }
  for (const firstPlayerId of [null, id(3), id(2).toUpperCase()]) {
    expect(transferStartingShards({ ...ready, firstPlayerId })).toBeNull();
  }
  expect(transferStartingShards(ready)?.after.bank).toEqual({ 1: 27, 5: 10 });
});
