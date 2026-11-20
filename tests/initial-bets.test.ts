import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { chooseInitialQuest, createLobby, launchPreparation, viewFor } from '@wonderland/game-engine';
import type { FactionId } from '@wonderland/shared';
import { lobbyState } from '@wonderland/shared/lobby-storage';
import { mergeLobbyView } from '../apps/web/src/merge-lobby-view.ts';

// Deliberately not catalog order, with different factions absent at 3 and 4 seats.
const factions: FactionId[] = ['jabberwocky', 'chat-du-cheshire', 'alice', 'reine-de-coeur', 'chapelier-fou'];
const random = () => 0;

it.each([2, 3, 4, 5])('WW-SETUP-003 K–M : mains et Chefs à %i sièges, fusion à révision publique égale', (count) => {
  const roster = factions.slice(0, count).map((faction) => ({ id: randomUUID(), name: faction, ready: true, faction }));
  const [host, guest] = roster;
  const outsider = randomUUID();
  const open = { ...createLobby('12345678', host), players: roster, firstPlayerId: guest.id };
  expect(viewFor(open, host.id).preparation).toBeNull();
  const launched = launchPreparation(open, host.id, open.revision, randomUUID, random);
  if (!launched.ok) throw new Error(launched.error);
  let state = lobbyState.parse(launched.value);

  // J1 is neither the first seat nor the last to choose.
  let beforeFinal = state;
  for (const player of roster.toReversed()) {
    beforeFinal = state;
    for (const { id } of roster) {
      expect(viewFor(state, id).preparation).toMatchObject({ initialBets: null, initialLeaders: null });
    }
    expect(viewFor(state, outsider).preparation).toBeNull();
    const offer = viewFor(state, player.id).preparation?.initialQuest;
    if (offer?.type !== 'offer') throw new Error('Offre attendue');
    const choice = chooseInitialQuest(state, player.id, { type: 'submit-decision', actionId: randomUUID(), expectedRevision: 0,
      params: { decisionId: offer.decisionId, optionId: offer.cards[0].optionId } }, random);
    if (!choice.ok) throw new Error(choice.error);
    state = lobbyState.parse(choice.state);
  }
  expect(state.game?.phase).toEqual({ type: 'setup' });
  expect(state.game?.decisions).toEqual([]);
  expect(viewFor(state, outsider).preparation).toBeNull();
  const expectedLeaders = { zone: 'end-of-table', leaders: roster.map(({ id, faction }) => ({ playerId: id, faction })) };
  const snapshot = structuredClone(state);
  for (const { id, faction } of roster) {
    const before = viewFor(beforeFinal, id);
    const after = viewFor(state, id);
    expect(after.revision).toBe(before.revision);
    expect(after.journal).toEqual(before.journal);
    expect(after.preparation?.initialBets).toEqual(count === 2 ? [] : factions.slice(0, count).filter((other) => other !== faction));
    expect(after.preparation?.initialLeaders).toStrictEqual(expectedLeaders);
    const differentJ1 = viewFor({ ...state, firstPlayerId: host.id }, id).preparation;
    expect(differentJ1?.initialBets).toEqual(after.preparation?.initialBets);
    expect(differentJ1?.initialLeaders).toEqual(expectedLeaders);
    expect(mergeLobbyView(before, after)).toEqual(after);
    expect(mergeLobbyView(after, before)).toEqual(after);
    expect(mergeLobbyView(after, viewFor(state, outsider)).preparation).toBeNull();
    // An unrelated seat or game must not inherit the previous view's availability.
    expect(mergeLobbyView(after, viewFor(beforeFinal, roster.find((seat) => seat.id !== id)!.id)).preparation?.initialLeaders).toBeNull();
    expect(mergeLobbyView(after, { ...before, preparation: { ...before.preparation!, gameId: randomUUID() } })
      .preparation?.initialLeaders).toBeNull();
  }
  expect(state).toStrictEqual(snapshot);
});
