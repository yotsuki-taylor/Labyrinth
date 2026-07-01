import type {
  ResourceMap,
  BuildingDTO,
  HeroClass,
  ExpeditionRoomDTO,
  ExpeditionStatus,
  CombatParticipantDTO,
  CombatLogEntry,
  CombatStatus,
} from '@labyrinth/shared';

export const SAVE_VERSION = 6;

/** A hero as persisted. Display stats are derived from class + level. */
export interface HeroSave {
  id: string;
  name: string;
  class: HeroClass;
  level: number;
  xp: number;
  hp: number; // current HP; 0 means dead
  isAlive: boolean;
  /** Unix timestamp (ms) when the hero auto-revives after death. */
  reviveAt?: number;
}

export interface ExpeditionSave {
  id: string;
  status: ExpeditionStatus;
  startedAt: string;
  heroId: string;
  depth: number;
  maxDepth: number;
  room: ExpeditionRoomDTO;
  pendingLoot: Partial<ResourceMap>;
}

export interface CombatSave {
  id: string;
  expeditionId: string;
  nodeId: string;
  status: CombatStatus;
  turn: number;
  participants: CombatParticipantDTO[];
  log: CombatLogEntry[];
  turnQueue: string[];
}

/** Lifetime play statistics shown on the Profile screen. */
export interface RunStatsSave {
  runsStarted: number;
  runsExtracted: number;
  runsFailed: number;
  roomsExplored: number;
  monstersSlain: number;
  bossesSlain: number;
  abilitiesGained: number;
  deepestDepth: number;
  /** Total resources ever secured via extraction. */
  lootExtracted: Partial<ResourceMap>;
}

export function createStats(): RunStatsSave {
  return {
    runsStarted: 0,
    runsExtracted: 0,
    runsFailed: 0,
    roomsExplored: 0,
    monstersSlain: 0,
    bossesSlain: 0,
    abilitiesGained: 0,
    deepestDepth: 0,
    lootExtracted: {},
  };
}

/** Permanent progress synced to Telegram CloudStorage across devices. */
export interface MetaSave {
  version: number;
  updatedAt: number;
  player: { id: string; username: string; createdAt: string };
  resources: ResourceMap;
  buildings: BuildingDTO[];
  heroes: HeroSave[];
  stats: RunStatsSave;
}

/** Full local state (meta + in-progress run) kept in localStorage. */
export interface SaveState extends MetaSave {
  expedition: ExpeditionSave | null;
  combat: CombatSave | null;
}

export function metaOf(state: SaveState): MetaSave {
  return {
    version: state.version,
    updatedAt: state.updatedAt,
    player: state.player,
    resources: state.resources,
    buildings: state.buildings,
    heroes: state.heroes,
    stats: state.stats,
  };
}
