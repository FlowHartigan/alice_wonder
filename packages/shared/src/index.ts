import { z } from 'zod';

export const MAX_PLAYERS = 5;
export const JOURNAL_LIMIT = 40;
export const roomCode = z.string().trim().toUpperCase().regex(/^[A-F0-9]{8}$/);
const playerName = z.string().trim().min(1).max(30).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const id = z.uuid();
export const createInput = z.strictObject({ name: playerName });
export const joinInput = createInput.extend({ code: roomCode });
export const credentials = z.strictObject({ code: roomCode, token: z.string().regex(/^[\w-]{43}$/) });
export const readyInput = z.strictObject({
  actionId: id, type: z.literal('set-ready'), ready: z.boolean(), expectedRevision: z.int().nonnegative(),
});
export const errorCodes = [
  'invalid', 'room-not-found', 'room-full', 'already-seated', 'unauthorized', 'conflict', 'unavailable',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

const publicPlayer = z.strictObject({ id, name: playerName, ready: z.boolean() });
const lobbyEvent = z.discriminatedUnion('type', [
  z.strictObject({ revision: z.int().positive(), type: z.literal('joined'), actorId: id }),
  z.strictObject({ revision: z.int().positive(), type: z.literal('set-ready'), actorId: id, ready: z.boolean() }),
]);
export const lobbyState = z.strictObject({
  version: z.literal(1), code: roomCode, hostId: id, revision: z.int().positive(),
  players: z.array(publicPlayer).min(1).max(MAX_PLAYERS), journal: z.array(lobbyEvent).max(JOURNAL_LIMIT),
});
export type LobbyState = z.infer<typeof lobbyState>;
export type LobbyAction = z.infer<typeof readyInput>;
export type Session = z.infer<typeof credentials>;
export type LobbyView = Omit<LobbyState, 'version'> & { you: string };
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
