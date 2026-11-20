import type { LobbyView } from '@wonderland/shared';

export function mergeLobbyView(previous: LobbyView | undefined, next: LobbyView): LobbyView {
  if (previous?.code !== next.code || previous.you !== next.you) return next;
  if (previous.revision > next.revision) return previous;
  const current = previous.preparation;
  const incoming = next.preparation;
  if (!current || !incoming || current.gameId !== incoming.gameId) return next;

  // J and K–M advance without incrementing the public lobby revision.
  const initialQuest = current.initialQuest.revision > incoming.initialQuest.revision
    ? current.initialQuest : incoming.initialQuest;
  const { initialBets, initialLeaders } = incoming.initialBets === null ? current : incoming;
  return { ...next, preparation: { ...incoming, initialQuest, initialBets, initialLeaders } };
}
