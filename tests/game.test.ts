import { expect, it } from 'vitest';
import { applyGameAction, privatePlayerView, publicGameView, shuffle } from '@wonderland/game-engine';
import { gameState } from '@wonderland/shared';
import type { GameAction, GamePhase, GameState } from '@wonderland/shared';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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

it('refuse une collision de révisions et une seconde soumission de la même décision', () => {
  const start = fixture();
  const proposedConcurrently = submit(32, 13, 26);
  expect(applyGameAction(start, first, proposedConcurrently).ok).toBe(true);
  const one = accepted(applyGameAction(start, first, a));
  expect(applyGameAction(one.state, first, proposedConcurrently)).toEqual({ ok: false, error: 'conflict' });
  expect(applyGameAction(one.state, first, { ...a, actionId: id(33), expectedRevision: 1 })).toEqual({
    ok: false, error: 'decision-unavailable',
  });
  expect(accepted(applyGameAction(one.state, first, nextA)).state.history).toHaveLength(2);
  expect(one.state.history).toHaveLength(1);
  expect(start.history).toEqual([]);
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
