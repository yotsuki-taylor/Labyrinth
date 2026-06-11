import type {
  ResourceMap,
  BuildingDTO,
  HeroClass,
  ExpeditionNodeDTO,
  ExpeditionStatus,
  CombatParticipantDTO,
  CombatLogEntry,
  CombatStatus,
} from '@labyrinth/shared';

export const SAVE_VERSION = 2;

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
  currentNodeId: string;
  startedAt: string;
  heroIds: string[];
  nodes: ExpeditionNodeDTO[];
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
}

/** Permanent progress synced to Telegram CloudStorage across devices. */
export interface MetaSave {
  version: number;
  updatedAt: number;
  player: { id: string; username: string; createdAt: string };
  resources: ResourceMap;
  buildings: BuildingDTO[];
  heroes: HeroSave[];
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
  };
}
