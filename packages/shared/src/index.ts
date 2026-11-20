import { z } from 'zod';
import { gameState } from './game.ts';
import { initialRegionScores } from './region-score-markers.ts';
import type { RegionScoresSetupView } from './region-score-markers.ts';
import type { RegionId } from './regions.ts';

export * from './game.ts';
export * from './region-score-markers.ts';
export * from './regions.ts';

export const MIN_PLAYERS = 2;
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
const launchInput = z.strictObject({
  actionId: id, type: z.literal('launch-preparation'), expectedRevision: z.int().nonnegative(),
});
export const lobbyAction = z.discriminatedUnion('type', [readyInput, factionInput, firstPlayerInput, launchInput]);
const launchBlockerCodes = ['player-count', 'factions-incomplete', 'players-not-ready', 'first-player-required'] as const;
export type LaunchBlocker = (typeof launchBlockerCodes)[number];
export const errorCodes = [
  'invalid', 'room-not-found', 'room-full', 'already-seated', 'unauthorized', 'conflict', 'unavailable',
  'faction-taken', 'faction-required', 'host-required', 'seat-not-found',
  'room-closed', 'already-launched', ...launchBlockerCodes,
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

const eventsV3 = [
  ...eventsV2,
  z.strictObject({ revision: z.int().positive(), type: z.literal('select-first-player'), actorId: id, firstPlayerId: id }),
  z.strictObject({ revision: z.int().positive(), type: z.literal('first-player-cleared') }),
] as const;
// During restoration only, allow a well-formed reference to a seat no longer on the roster.
export const lobbyStateV3 = lobbyWithFactions.extend({
  version: z.literal(3), firstPlayerId: id.nullable(), journal: z.array(z.discriminatedUnion('type', eventsV3)).max(JOURNAL_LIMIT),
}).refine(factionsAreUnique, uniqueFactionMessage);
export type LobbyStateV3 = z.infer<typeof lobbyStateV3>;

// WW-COUNT-001/002 (effectif seulement), WW-SETUP-002 et WW-SETUP-005.
// Shared by the transition, its projection and validation on restore.
export function preparationBlockers({ players, firstPlayerId }: Pick<LobbyStateV3, 'players' | 'firstPlayerId'>): LaunchBlocker[] {
  const blockers: LaunchBlocker[] = [];
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) blockers.push('player-count');
  if (!players.every(({ faction }) => factionId.safeParse(faction).success) || !factionsAreUnique({ players })) {
    blockers.push('factions-incomplete');
  }
  if (!players.every(({ ready }) => ready)) blockers.push('players-not-ready');
  if (firstPlayerId === null || !players.some(({ id }) => id === firstPlayerId)) blockers.push('first-player-required');
  return blockers;
}

const lobbyEvent = z.discriminatedUnion('type', [
  ...eventsV3,
  z.strictObject({ revision: z.int().positive(), type: z.literal('launch-preparation'), actorId: id }),
]);
const lobbyWithGame = lobbyWithFactions.omit({ version: true }).extend({
  firstPlayerId: id.nullable(), game: gameState.nullable(),
  journal: z.array(lobbyEvent).max(JOURNAL_LIMIT),
});
function validPreparation(state: z.infer<typeof lobbyWithGame>) {
  const { players, hostId, game, journal, revision } = state;
  const seats = new Set(players.map(({ id }) => id));
  if (seats.size !== players.length || !seats.has(hostId)) return false;
  const launches = journal.filter(({ type }) => type === 'launch-preparation');
  if (!game) return launches.length === 0;
  const last = journal.at(-1);
  return preparationBlockers(state).length === 0
    && game.phase.type === 'setup' && game.revision === 0 && game.decisions.length === 0 && game.history.length === 0
    && game.playerIds.length === players.length && players.every(({ id }, i) => game.playerIds[i] === id)
    && launches.length === 1 && last?.type === 'launch-preparation'
    && last.actorId === hostId && last.revision === revision;
}
const preparationMessage = 'Sièges ou état de préparation incohérents';
export const lobbySnapshotV4 = lobbyWithGame.extend({
  version: z.literal(4), regionScores: initialRegionScores.optional(),
}).refine(factionsAreUnique, uniqueFactionMessage)
  .refine((state) => validPreparation(state) && (state.game !== null || state.regionScores === undefined), preparationMessage);
export type LobbySnapshotV4 = z.infer<typeof lobbySnapshotV4>;

export const lobbyWithScores = lobbyWithGame.extend({ regionScores: initialRegionScores.nullable() });
export function validInitialPreparation(state: z.infer<typeof lobbyWithScores>) {
  return factionsAreUnique(state) && validPreparation(state) && (state.game === null) === (state.regionScores === null);
}
export const lobbySnapshotV5 = lobbyWithScores.extend({
  version: z.literal(5),
}).refine(validInitialPreparation, preparationMessage);
export type LobbySnapshotV5 = z.infer<typeof lobbySnapshotV5>;

export type LobbyAction = z.infer<typeof lobbyAction>;
export type Session = z.infer<typeof credentials>;
export type TeaTableSetupView = { openChairs: number; activeBlockers: ('4J' | '5J')[] };
// Public to admitted seats in setup only; not a balance or an active turn.
export type FirstTeaSetupView = { playerId: string; turn: number; plannedShards: number }[];
// Planned values only; not player inventory. The bag is represented by a count alone.
export type IndividualResourcesSetupView = {
  playerId: string;
  faction: FactionId;
  boardFace: 'ordinary' | 'golden-two-player';
  supportersInReserve: number;
  supportersOnThirdForgeTrack: number;
  castlesInReserve: number;
  artifactsOnForge: number;
  coveredAbilities: number;
  leaderStrength: number;
  shield: 'intact';
  victoryPoints: number;
  combat: number;
  bagTokenCount: number;
  poisonInReserve: number;
}[];
export type TwoPlayerSetupView = {
  revealedQuestTitle: string;
  excludedRegion: { id: RegionId; name: string };
};
export type FirstBattleSetupView = {
  dieResult: number;
  region: { id: RegionId; name: string };
};
export type LobbyView = Pick<z.infer<typeof lobbyWithGame>, 'code' | 'hostId' | 'revision' | 'firstPlayerId' | 'players' | 'journal'> & {
  you: string;
  canSetReady: boolean;
  canSelectFirstPlayer: boolean;
  launch: { blockers: LaunchBlocker[] } | null;
  preparation: {
    gameId: string;
    teaTable: TeaTableSetupView;
    regionScores: RegionScoresSetupView;
    twoPlayerSetup: TwoPlayerSetupView | null;
    firstTeaPreview: FirstTeaSetupView;
    individualResourcesPreview: IndividualResourcesSetupView;
    firstBattle: FirstBattleSetupView;
  } | null;
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
