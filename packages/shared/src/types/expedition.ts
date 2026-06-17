import type { ResourceType, ResourceMap } from './resources.js';

/** Each expedition is a sequence of rooms; the player walks through one at a time. */
export type RoomType = 'start' | 'empty' | 'loot' | 'treasure' | 'boss';
export type ExpeditionStatus = 'active' | 'completed' | 'failed';

/** A collectible resource pile placed somewhere on the room floor. */
export interface RoomPickupDTO {
  id: string;
  resource: ResourceType;
  amount: number;
  /** Tile coordinates within the room. */
  x: number;
  y: number;
  collected: boolean;
}

/** A doorway leading out of the room. Each room has exactly two. */
export interface RoomExitDTO {
  id: string;
  side: 'left' | 'right';
  /** Preview of the room this door leads to (shown as an icon hint). */
  leadsTo: RoomType;
  /** When true, taking this door extracts the player (final room). */
  isExtract: boolean;
}

/** A single isometric room the player physically explores. */
export interface ExpeditionRoomDTO {
  id: string;
  depth: number;
  type: RoomType;
  /** Floor size in tiles. */
  width: number;
  height: number;
  pickups: RoomPickupDTO[];
  /** Exactly two exits. */
  exits: RoomExitDTO[];
  /** True when this room's exits extract instead of leading deeper. */
  isFinal: boolean;
  /** Impassable wall tiles encoded as "col,row" strings. */
  walls: string[];
}

export interface ExpeditionDTO {
  id: string;
  status: ExpeditionStatus;
  heroId: string;
  /** The room the player is currently exploring. */
  room: ExpeditionRoomDTO;
  /** Resources collected this run, not yet secured. */
  pendingLoot: Partial<ResourceMap>;
  depth: number;
  maxDepth: number;
  startedAt: string;
}

export interface ExtractResult {
  success: boolean;
  lootGained: Partial<ResourceMap>;
  message: string;
}
