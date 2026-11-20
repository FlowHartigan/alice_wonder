import { expect, it, vi } from 'vitest';
import { applyGameAction, createLobby, firstTeaForSetup, initializeGame, launchPreparation, privatePlayerView, publicGameView, shuffle, teaTableForSetup } from '@wonderland/game-engine';
import { FACTION_IDS, gameState } from '@wonderland/shared';
import { lobbyState, STARTING_TOKEN_TYPES, startingSeatResources } from '@wonderland/shared/lobby-storage';
import type { GameAction, GamePhase, GameState } from '@wonderland/shared';

const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const variant = (uuid: string) => uuid.toUpperCase();
const [gameId, firstPlayer, secondPlayer] = [id(1), id(2), id(3)];
const first = { gameId, playerId: firstPlayer };
const second = { gameId, playerId: secondPlayer };
const tea = { type: 'tea', round: 1 } as const;

// Synthetic choices only: no card, bag, turn or stage of Wonderland's War is resolved here.
function fixture(random = () => 0.99): GameState {
  const samples = [id(21), id(22), id(23)];
  return gameState.parse({
    version: 1, gameId, revision: 10, phase: tea, playerIds: [firstPlayer, secondPlayer], history: [],
    decisions: [
      { id: id(11), actorId: firstPlayer, phase: tea, optionIds: shuffle(samples, random).slice(0, 2) },
      { id: id(12), actorId: secondPlayer, phase: tea, optionIds: [id(24), id(25)] },
      { id: id(13), actorId: firstPlayer, phase: tea, optionIds: [id(26)] },
    ],
  });
}

const submit = (actionId: number, decisionId: number, optionId: number, expectedRevision = 0): GameAction => ({
  actionId: id(actionId), expectedRevision, type: 'submit-decision',
  params: { decisionId: id(decisionId), optionId: id(optionId) },
});
const a = submit(31, 11, 21);
const b = submit(31, 12, 24); // Same key, different session.
const nextA = submit(32, 13, 26, 1);
const eventA = { type: 'decision-submitted', decisionId: id(11), optionId: id(21) };
const eventB = { type: 'decision-submitted', decisionId: id(12), optionId: id(24) };

function accepted(result: ReturnType<typeof applyGameAction>) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

it.each([
  { count: 2, openChairs: 11, activeBlockers: ['4J', '5J'] },
  { count: 3, openChairs: 11, activeBlockers: ['4J', '5J'] },
  { count: 4, openChairs: 12, activeBlockers: ['5J'] },
  { count: 5, openChairs: 13, activeBlockers: [] },
])('WW-SETUP-004 / WW-COUNT-001/002 : table du Thé à $count joueurs', ({ count, ...expected }) => {
  const state = initializeGame(gameId, Array.from({ length: count }, (_, i) => id(i + 2)));
  const before = structuredClone(state);
  expect(teaTableForSetup(state)).toEqual(expected);
  expect(state).toEqual(before);
});

it.each([
  { seats: [2, 3], clockwise: [3, 2], shards: [2, 1] },
  { seats: [2, 3, 4], clockwise: [3, 4, 2], shards: [3, 2, 1] },
  { seats: [2, 3, 4, 5], clockwise: [3, 4, 5, 2], shards: [3, 2, 2, 1] },
  { seats: [2, 3, 4, 5, 6], clockwise: [3, 4, 5, 6, 2], shards: [3, 2, 2, 1, 0] },
])('WW-SETUP-005 : tourne depuis J1 non hôte et prévoit $shards Éclats', ({ seats, clockwise, shards }) => {
  const state = initializeGame(gameId, seats.map(id));
  const before = structuredClone(state);
  Object.freeze(state.playerIds);
  Object.freeze(state);
  const expected = clockwise.map((seat, index) => ({ playerId: id(seat), turn: index + 1, plannedShards: shards[index] }));
  expect(firstTeaForSetup(state, id(3))).toEqual(expected);
  expect(firstTeaForSetup(state, id(3))).toEqual(expected);
  expect(firstTeaForSetup(state, id(2))?.map(({ playerId }) => playerId)).toEqual(seats.map(id));
  expect(state).toEqual(before);
});

it('WW-SETUP-005 : pas d’aperçu sans J1 admis, hors setup ou avec un effectif non prévu', () => {
  const state = initializeGame(gameId, [firstPlayer, secondPlayer]);
  for (const j1 of [null, id(99)]) expect(firstTeaForSetup(state, j1)).toBeNull();
  for (const phase of [tea, { type: 'war', round: 1 } as const]) {
    expect(firstTeaForSetup({ ...state, phase }, firstPlayer)).toBeNull();
  }
  for (const count of [1, 6]) {
    const playerIds = Array.from({ length: count }, (_, i) => id(i + 2));
    expect(firstTeaForSetup({ ...state, playerIds }, firstPlayer)).toBeNull();
  }
});

it.each([
  { count: 2, poison: 4, boardFace: 'golden-two-player', bagTokenCount: 11 },
  { count: 3, poison: 5, boardFace: 'ordinary', bagTokenCount: 10 },
  { count: 4, poison: 6, boardFace: 'ordinary', bagTokenCount: 10 },
  { count: 5, poison: 7, boardFace: 'ordinary', bagTokenCount: 10 },
  { count: 2, poison: 0, boardFace: 'golden-two-player', bagTokenCount: 11 },
  { count: 3, poison: 0, boardFace: 'ordinary', bagTokenCount: 10 },
  { count: 4, poison: 0, boardFace: 'ordinary', bagTokenCount: 10 },
])('WW-SETUP-002/003 : dotation exacte à $count sièges (Poison : $poison)', ({ count, poison, boardFace, bagTokenCount }) => {
  const otherFactions = FACTION_IDS.filter((faction) => faction !== 'jabberwocky');
  const factions = poison ? ['jabberwocky' as const, ...otherFactions].slice(0, count) : otherFactions.slice(0, count);
  const players = factions.map((faction, i) => Object.freeze({ id: id(i + 2), name: `Siège ${i + 1}`, faction, ready: true }));
  const state = { ...createLobby('ABCDEF12', players[0]), players, firstPlayerId: players.at(-1)!.id };
  const run = (random: () => number) => {
    const result = launchPreparation(state, state.hostId, state.revision, () => gameId, random);
    if (!result.ok) throw new Error(result.error);
    return lobbyState.parse(result.value);
  };
  const launched = run(() => 0);
  expect(run(() => 0)).toEqual(launched);
  expect(state.individualResources).toBeNull();
  expect(launched.game).toEqual(initializeGame(gameId, players.map(({ id }) => id)));
  const allIds: string[] = [];
  for (const [i, seat] of launched.individualResources!.entries()) {
    const { tokenZones, ...holdings } = seat;
    const { id: playerId, faction } = players[i];
    expect(holdings).toEqual({
      playerId, faction, boardFace, supportersInReserve: 10, supportersOnThirdForgeTrack: 4, castlesInReserve: 5,
      coveredAbilities: 4, leaderStrength: 1, shield: 'intact', victoryPoints: 0, combat: 0,
    });
    const { bag, forgeRewards, poisonReserve, active, exhausted, madnessTrack } = tokenZones;
    expect(bag).toHaveLength(bagTokenCount);
    expect(bag.map(({ type }) => type).sort()).toEqual([
      'artifact-3', 'artifact-3', ...(count === 2 ? ['forge-1'] : []), 'forge-1',
      'leader-1', 'leader-1', 'leader-1', 'leader-2', 'madness-double', 'madness-single', 'madness-single',
    ]);
    expect(forgeRewards.map(({ type }) => type)).toEqual(Array(4).fill('artifact-3'));
    expect(poisonReserve.map(({ type }) => type)).toEqual(Array(faction === 'jabberwocky' ? poison : 0).fill('poison'));
    expect([active, exhausted, madnessTrack]).toEqual([[], [], []]);
    const originalBag = startingSeatResources(playerId, faction, count).tokenZones.bag;
    expect(bag).toEqual([...originalBag.slice(1), originalBag[0]]);
    for (const zone of Object.values(tokenZones)) allIds.push(...zone.map(({ id }) => id));
  }
  expect(new Set(allIds).size).toBe(allIds.length);
  expect(STARTING_TOKEN_TYPES).toEqual({
    'leader-1': { kind: 'leader', strength: 1 }, 'leader-2': { kind: 'leader', strength: 2 },
    'artifact-3': { kind: 'artifact', strength: 3 }, 'forge-1': { kind: 'forge', strength: 1 },
    'madness-single': { kind: 'madness', level: 'single' }, 'madness-double': { kind: 'madness', level: 'double' },
    poison: { kind: 'poison' },
  });
  expect(run(() => 0.99).individualResources![0].tokenZones.bag).not.toEqual(launched.individualResources![0].tokenZones.bag);
});

it('rejoue les mêmes intentions et événements à partir du même hasard injecté', () => {
  function run(values: number[]) {
    const draws = [...values];
    const start = fixture(() => draws.shift() ?? NaN);
    const one = accepted(applyGameAction(start, first, a));
    const two = accepted(applyGameAction(one.state, second, b));
    expect(draws).toEqual([]);
    expect(start).toEqual(fixture());
    return [one, two];
  }

  const firstRun = run([0.99, 0.75]);
  expect(run([0.99, 0.75])).toEqual(firstRun);
  expect(firstRun.map(({ receipt }) => receipt.event)).toEqual([eventA, eventB]);
  expect(firstRun.map(({ state }) => [state.version, state.revision, state.phase])).toEqual([
    [1, 11, tea], [1, 12, tea],
  ]);
  expect(applyGameAction(fixture(() => 0), first, a)).toEqual({ ok: false, error: 'invalid' });
});

it('mélange sans changer la source et rejette les tirages hors contrat', () => {
  const source = Object.freeze([1, 2, 3]);
  expect(shuffle(source, () => 0)).toEqual([2, 3, 1]);
  expect(shuffle([1], () => { throw new Error('aucun tirage attendu'); })).toEqual([1]);
  for (const value of [-0.01, 1, Infinity, NaN]) expect(() => shuffle(source, () => value)).toThrow(RangeError);
});

it('rejoue le reçu original après de nouvelles actions et un aller-retour du snapshot', () => {
  const one = accepted(applyGameAction(fixture(), first, a));
  expect(one.changed).toBe(true);
  expect(one.receipt).toEqual({ revision: 1, event: eventA });
  const duplicate = accepted(applyGameAction(one.state, first, a));
  expect(duplicate.changed).toBe(false);
  expect(duplicate.state).toBe(one.state);
  expect(duplicate.receipt).toEqual(one.receipt);

  const two = accepted(applyGameAction(one.state, second, b));
  expect(two.receipt).toEqual({ revision: 1, event: eventB });
  const three = accepted(applyGameAction(two.state, first, nextA));
  const restored = gameState.parse(JSON.parse(JSON.stringify(three.state)));
  const replay = accepted(applyGameAction(restored, first, a));
  expect(replay).toMatchObject({ changed: false, receipt: one.receipt });
  expect(replay.state).toBe(restored);
  expect(privatePlayerView(replay.state, first)?.events).toHaveLength(2);
  expect(accepted(applyGameAction(restored, second, b)).receipt).toEqual(two.receipt);
  expect(applyGameAction(restored, first, { ...a, expectedRevision: 2 })).toEqual({ ok: false, error: 'conflict' });
  expect(applyGameAction(restored, first, submit(31, 11, 22))).toEqual({ ok: false, error: 'conflict' });
});

it('rejoue un succès après un changement de phase, sans permettre un nouveau dépôt hors phase', () => {
  const one = accepted(applyGameAction(fixture(), first, a));
  // Restored fixture only: this engine does not implement a phase transition.
  const restored = gameState.parse(JSON.parse(JSON.stringify({
    ...one.state, revision: one.state.revision + 1, phase: { type: 'war', round: 1 },
  })));
  expect(applyGameAction(restored, first, nextA)).toEqual({ ok: false, error: 'wrong-phase' });
  const replay = accepted(applyGameAction(restored, first, a));
  expect(replay.changed).toBe(false);
  expect(replay.receipt).toEqual(one.receipt);
  expect(replay.state).toBe(restored);
});

it('refuse une collision de révisions et une seconde soumission de la même décision', () => {
  const start = fixture();
  const proposedConcurrently = submit(32, 13, 26);
  expect(applyGameAction(start, first, proposedConcurrently).ok).toBe(true);
  const one = accepted(applyGameAction(start, first, a));
  const conflict = { ok: false, error: 'conflict' };
  expect(applyGameAction(one.state, first, proposedConcurrently)).toEqual(conflict);
  // A different otherwise valid command cannot reuse a key already bound to a success.
  expect(applyGameAction(one.state, first, { ...nextA, actionId: a.actionId })).toEqual(conflict);
  expect(applyGameAction(one.state, first, { ...a, actionId: id(33), expectedRevision: 1 })).toEqual({
    ok: false, error: 'decision-unavailable',
  });
  const corrected = accepted(applyGameAction(one.state, first, nextA));
  expect(corrected.state.history).toHaveLength(2);
  expect(applyGameAction(corrected.state, first, proposedConcurrently)).toEqual(conflict);
  expect(one.state.history).toHaveLength(1);
  expect(start.history).toEqual([]);
});

it('refuse une révision future sans mutation ni tirage et exige un renvoi explicite', () => {
  const random = vi.fn(() => 0.99);
  const start = fixture(random);
  const before = structuredClone(start);
  random.mockClear();
  const implicitRandom = vi.spyOn(Math, 'random');
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(applyGameAction(start, first, nextA)).toEqual({ ok: false, error: 'conflict' });
    }
    expect(implicitRandom).not.toHaveBeenCalled();
  } finally {
    implicitRandom.mockRestore();
  }
  expect(random).not.toHaveBeenCalled();
  expect(start).toEqual(before);

  const one = accepted(applyGameAction(start, first, a));
  expect(one.state.revision).toBe(before.revision + 1);
  expect(one.state.history.map(({ action }) => action)).toEqual([a]);
  expect(privatePlayerView(one.state, first)).toMatchObject({
    revision: 1, decisions: [{ id: id(13), optionIds: [id(26)] }], events: [eventA],
  });
  const resent = accepted(applyGameAction(one.state, first, nextA));
  expect(resent.changed).toBe(true);
  expect(resent.receipt.revision).toBe(2);
  expect(resent.state.history.map(({ action }) => action)).toEqual([a, nextA]);
});

it.each<GamePhase>([{ type: 'setup' }, { type: 'war', round: 1 }, { type: 'tea', round: 2 }])(
  'refuse la décision hors phase (%j) et ne la propose pas dans la vue', (phase) => {
    const state = { ...fixture(), phase };
    expect(applyGameAction(state, first, a)).toEqual({ ok: false, error: 'wrong-phase' });
    expect(privatePlayerView(state, first)?.decisions).toEqual([]);
    expect(state.history).toEqual([]);
  },
);

it('contrôle la session, l’intention et ses paramètres sans donner d’oracle sur les décisions adverses', () => {
  const start = fixture();
  for (const seat of [undefined, { ...first, gameId: id(99) }, { gameId, playerId: id(99) }]) {
    expect(applyGameAction(start, seat, a)).toEqual({ ok: false, error: 'unauthorized' });
    expect(privatePlayerView(start, seat)).toBeUndefined();
  }
  const invalid = { ok: false, error: 'invalid' };
  for (const action of [
    { ...a, actorId: firstPlayer }, { ...a, type: 'play' }, { ...a, actionId: 'no' },
    { ...a, params: { ...a.params, randomness: 0 } }, { ...a, params: { decisionId: id(11) } },
    { ...a, expectedRevision: -1 }, submit(31, 11, 24),
  ]) {
    expect(applyGameAction(start, first, action)).toEqual(invalid);
  }
  const unavailable = { ok: false, error: 'decision-unavailable' };
  const after = accepted(applyGameAction(start, first, a)).state;
  expect(applyGameAction(start, second, a)).toEqual(unavailable);
  expect(applyGameAction(after, second, a)).toEqual(unavailable);
  expect(applyGameAction(start, second, submit(31, 99, 21))).toEqual(unavailable);
});

it('refuse les UUID non canoniques du siège, de la commande et du rejeu', () => {
  const start = fixture();
  for (const seat of [{ ...first, gameId: variant(gameId) }, { ...first, playerId: variant(firstPlayer) }]) {
    expect(applyGameAction(start, seat, a)).toEqual({ ok: false, error: 'unauthorized' });
    expect(privatePlayerView(start, seat)).toBeUndefined();
  }
  const one = accepted(applyGameAction(start, first, a));
  const before = structuredClone(one.state);
  for (const command of [
    { ...a, actionId: variant(a.actionId) },
    { ...a, params: { ...a.params, decisionId: variant(a.params.decisionId) } },
    { ...a, params: { ...a.params, optionId: variant(a.params.optionId) } },
  ]) {
    expect(applyGameAction(start, first, command)).toEqual({ ok: false, error: 'invalid' });
    expect(applyGameAction(one.state, first, command)).toEqual({ ok: false, error: 'invalid' });
  }
  // The case alias cannot submit a second decision at the now-current revision either.
  expect(applyGameAction(one.state, first, { ...nextA, actionId: variant(a.actionId) })).toEqual({
    ok: false, error: 'invalid',
  });
  expect(one.state).toEqual(before);
});

it('sépare les décisions et événements des deux vues et ne publie aucun champ interne', () => {
  const start = fixture();
  const publicView = { gameId, phase: tea, playerIds: [firstPlayer, secondPlayer] };
  const beforeB = {
    public: publicView, you: secondPlayer, revision: 0, decisions: [{ id: id(12), optionIds: [id(24), id(25)] }], events: [],
  };
  expect(privatePlayerView(start, first)).toEqual({
    public: publicView, you: firstPlayer, revision: 0,
    decisions: [{ id: id(11), optionIds: [id(21), id(22)] }, { id: id(13), optionIds: [id(26)] }], events: [],
  });
  expect(privatePlayerView(start, second)).toEqual(beforeB);
  const afterA = accepted(applyGameAction(start, first, a)).state;
  expect(publicGameView(afterA)).toEqual(publicView);
  expect(privatePlayerView(afterA, second)).toEqual(beforeB);
  const afterB = accepted(applyGameAction(afterA, second, b)).state;

  // Sentinel fields simulate future internal data, even if passed directly without schema stripping.
  const internal = {
    ...afterB, bagOrder: ['sac-secret'], phase: { ...tea, deck: ['pioche-secrète'] },
    decisions: afterB.decisions.map((decision) => ({ ...decision, card: 'carte-secrète' })),
    history: afterB.history.map((entry) => ({ ...entry, event: { ...entry.event, choice: 'choix-interne' } })),
  };
  expect(publicGameView(internal)).toEqual(publicView);
  expect(privatePlayerView(internal, first)).toEqual({
    public: publicView, you: firstPlayer, revision: 1,
    decisions: [{ id: id(13), optionIds: [id(26)] }], events: [eventA],
  });
  expect(privatePlayerView(internal, second)).toEqual({ ...beforeB, revision: 1, decisions: [], events: [eventB] });
  expect(accepted(applyGameAction(internal, second, b)).receipt).toEqual({ revision: 1, event: eventB });
});

it('rejette les formats inconnus, les rounds invalides et les identités ou décisions incohérentes', () => {
  const state = fixture();
  for (const invalid of [
    { ...state, version: 2 }, { ...state, phase: { type: 'tea', round: 4 } },
    { ...state, phase: { type: 'setup', round: 1 } }, { ...state, playerIds: [firstPlayer, firstPlayer] },
    { ...state, decisions: [...state.decisions, state.decisions[0]] },
    { ...state, decisions: [{ ...state.decisions[0], actorId: id(99) }] },
  ]) {
    expect(gameState.safeParse(invalid).success).toBe(false);
  }
});

it('rejette les UUID non canoniques et les doublons de casse dans le snapshot', () => {
  const state = fixture();
  const [decision] = state.decisions;
  for (const invalid of [
    { ...state, gameId: variant(gameId) },
    { ...state, playerIds: [firstPlayer, variant(firstPlayer)] },
    { ...state, decisions: [{ ...decision, actorId: variant(firstPlayer) }] },
    { ...state, decisions: [decision, { ...decision, id: variant(decision.id) }] },
    { ...state, decisions: [{ ...decision, optionIds: [id(21), variant(id(21))] }] },
  ]) {
    expect(gameState.safeParse(invalid).success).toBe(false);
  }
});

const historyCorruptions: Record<string, (snapshot: GameState) => void> = {
  'acteur inconnu': (state) => { state.history[0].actorId = id(99); },
  'acteur non canonique': (state) => { state.history[0].actorId = variant(firstPlayer); },
  'clé de succès réutilisée pour une autre décision': (state) => { state.history[1].action.actionId = a.actionId; },
  'variante de casse de la clé de succès': (state) => { state.history[1].action.actionId = variant(a.actionId); },
  'décision différente dans le reçu': (state) => { state.history[0].event.decisionId = id(99); },
  'option différente dans le reçu': (state) => { state.history[0].event.optionId = id(22); },
  'décision non canonique dans la commande et son événement': (state) => {
    state.history[0].action.params.decisionId = state.history[0].event.decisionId = variant(id(11));
  },
  'option non canonique dans la commande et son événement': (state) => {
    state.history[0].action.params.optionId = state.history[0].event.optionId = variant(id(21));
  },
  'révision privée non contiguë': (state) => { state.history[1].action.expectedRevision = 2; },
  'décision consommée encore en attente': (state) => { state.decisions.push(fixture().decisions[0]); },
  'révision globale inférieure au nombre de succès': (state) => { state.revision = 1; },
};

it.each(Object.entries(historyCorruptions))('refuse de restaurer un historique malformé : %s', (_label, corrupt) => {
  const one = accepted(applyGameAction(fixture(), first, a));
  const two = accepted(applyGameAction(one.state, first, nextA));
  const snapshot = gameState.parse(JSON.parse(JSON.stringify(two.state)));
  corrupt(snapshot);
  expect(gameState.safeParse(JSON.parse(JSON.stringify(snapshot))).success).toBe(false);
});
