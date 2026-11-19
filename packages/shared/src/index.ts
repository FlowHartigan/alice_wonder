import { z } from 'zod';

export * from './game.ts';

export const MAX_PLAYERS = 5;
export const JOURNAL_LIMIT = 40;
export const roomCode = z.string().trim().toUpperCase().regex(/^[A-F0-9]{8}$/);
const playerName = z.string().trim().min(1).max(30).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const id = z.uuid();
// WW-FACTION-001 — les cinq noms des Chefs du livret de base FR, p. 10–11.
export const FACTION_NAMES = {
  alice: 'Alice',
  'chapelier-fou': 'Chapelier fou',
  'reine-de-coeur': 'Reine de cœur',
  jabberwocky: 'Jabberwocky',
  'chat-du-cheshire': 'Chat du Cheshire',
} as const;
export type FactionId = keyof typeof FACTION_NAMES;
export const FACTION_IDS: readonly FactionId[] = Object.keys(FACTION_NAMES) as FactionId[];
const factionId = z.enum(FACTION_IDS);

export const createInput = z.strictObject({ name: playerName });
export const joinInput = createInput.extend({ code: roomCode });
export const credentials = z.strictObject({ code: roomCode, token: z.string().regex(/^[\w-]{43}$/) });
const readyInput = z.strictObject({
  actionId: id, type: z.literal('set-ready'), ready: z.boolean(), expectedRevision: z.int().nonnegative(),
});
const factionInput = z.strictObject({
  actionId: id, type: z.literal('select-faction'), faction: factionId, expectedRevision: z.int().nonnegative(),
});
const firstPlayerInput = z.strictObject({
  actionId: id, type: z.literal('select-first-player'), firstPlayerId: id, expectedRevision: z.int().nonnegative(),
});
export const lobbyAction = z.discriminatedUnion('type', [readyInput, factionInput, firstPlayerInput]);
export const errorCodes = [
  'invalid', 'room-not-found', 'room-full', 'already-seated', 'unauthorized', 'conflict', 'unavailable',
  'faction-taken', 'faction-required', 'host-required', 'seat-not-found',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

const playerV1 = z.strictObject({ id, name: playerName, ready: z.boolean() });
const eventsV1 = [
  z.strictObject({ revision: z.int().positive(), type: z.literal('joined'), actorId: id }),
  z.strictObject({ revision: z.int().positive(), type: z.literal('set-ready'), actorId: id, ready: z.boolean() }),
] as const;
export const lobbyStateV1 = z.strictObject({
  version: z.literal(1), code: roomCode, hostId: id, revision: z.int().positive(),
  players: z.array(playerV1).min(1).max(MAX_PLAYERS),
  journal: z.array(z.discriminatedUnion('type', eventsV1)).max(JOURNAL_LIMIT),
});
export type LobbyStateV1 = z.infer<typeof lobbyStateV1>;
const playerV2 = playerV1.extend({ faction: factionId.nullable() }).refine(
  (player) => !player.ready || player.faction !== null, 'Un siège prêt doit avoir une faction',
);
const eventsV2 = [
  ...eventsV1,
  z.strictObject({
    revision: z.int().positive(), type: z.literal('select-faction'), actorId: id,
    faction: factionId, previousFaction: factionId.nullable(), wasReady: z.boolean(),
  }),
  z.strictObject({
    revision: z.int().positive(), type: z.literal('factions-enabled'),
    resetReadyCount: z.int().nonnegative().max(MAX_PLAYERS),
  }),
] as const;
const factionsAreUnique = ({ players }: { players: { faction: FactionId | null }[] }) => {
  const chosen = players.flatMap(({ faction }) => faction === null ? [] : [faction]);
  return new Set(chosen).size === chosen.length;
};
const uniqueFactionMessage = 'Chaque faction ne peut appartenir qu’à un siège';
const lobbyWithFactions = lobbyStateV1.extend({ players: z.array(playerV2).min(1).max(MAX_PLAYERS) });
export const lobbyStateV2 = lobbyWithFactions.extend({
  version: z.literal(2), journal: z.array(z.discriminatedUnion('type', eventsV2)).max(JOURNAL_LIMIT),
}).refine(factionsAreUnique, uniqueFactionMessage);
export type LobbyStateV2 = z.infer<typeof lobbyStateV2>;

const lobbyEvent = z.discriminatedUnion('type', [
  ...eventsV2,
  z.strictObject({ revision: z.int().positive(), type: z.literal('select-first-player'), actorId: id, firstPlayerId: id }),
  z.strictObject({ revision: z.int().positive(), type: z.literal('first-player-cleared') }),
]);
// During restoration only, allow a well-formed reference to a seat no longer on the roster.
export const lobbySnapshot = lobbyWithFactions.extend({
  version: z.literal(3), firstPlayerId: id.nullable(), journal: z.array(lobbyEvent).max(JOURNAL_LIMIT),
}).refine(factionsAreUnique, uniqueFactionMessage);
export const lobbyState = lobbySnapshot.refine(({ firstPlayerId, players }) => (
  firstPlayerId === null || players.some(({ id }) => id === firstPlayerId)
), { message: 'Le premier joueur doit avoir un siège dans le salon', path: ['firstPlayerId'] });
export type LobbyState = z.infer<typeof lobbyState>;
export type LobbyAction = z.infer<typeof lobbyAction>;
export type Session = z.infer<typeof credentials>;
export type LobbyView = Omit<LobbyState, 'version'> & {
  you: string;
  canSetReady: boolean;
  canSelectFirstPlayer: boolean;
  factions: { id: FactionId; status: 'available' | 'yours' | 'taken' }[];
};
export type Reply<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };
type Ack<T> = (reply: Reply<T>) => void;
type Admission = { session: Session; view: LobbyView };

export interface ClientEvents {
  'lobby:create': (input: z.input<typeof createInput>, ack: Ack<Admission>) => void;
  'lobby:join': (input: z.input<typeof joinInput>, ack: Ack<Admission>) => void;
  'lobby:resume': (input: Session, ack: Ack<LobbyView>) => void;
  'lobby:action': (input: LobbyAction, ack: Ack<LobbyView>) => void;
}
export interface ServerEvents {
  'lobby:update': (view: LobbyView) => void;
}
