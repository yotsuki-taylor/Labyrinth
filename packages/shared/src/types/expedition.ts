import type { ResourceMap } from './resources.js';

export type NodeType = 'start' | 'empty' | 'loot' | 'pve_combat' | 'exit';
export type ExpeditionStatus = 'active' | 'completed' | 'failed';

export interface ExpeditionNodeDTO {
  id: string;
  type: NodeType;
  visited: boolean;
  /** IDs of connected nodes */
  connections: string[];
  /** Position for rendering */
  x: number;
  y: number;
  loot?: Partial<ResourceMap>;
}

export interface ExpeditionDTO {
  id: string;
  status: ExpeditionStatus;
  currentNodeId: string;
  nodes: ExpeditionNodeDTO[];
  heroIds: string[];
  /** Temporary loot collected during this run */
  pendingLoot: Partial<ResourceMap>;
  startedAt: string;
}

export interface MoveRequest {
  expeditionId: string;
  targetNodeId: string;
}

export interface MoveResult {
  expedition: ExpeditionDTO;
  event: 'moved' | 'loot_found' | 'combat_started' | 'exited';
  combatId?: string;
  loot?: Partial<ResourceMap>;
}

export interface ExtractResult {
  success: boolean;
  lootGained: Partial<ResourceMap>;
  message: string;
}
