import type { ResourceMap } from './resources.js';
import type { BuildingType } from './buildings.js';

export interface PlayerDTO {
  id: string;
  telegramId: string;
  username: string;
  createdAt: string;
}

export interface BaseDTO {
  id: string;
  level: number;
  buildings: BuildingDTO[];
}

export interface BuildingDTO {
  id: string;
  type: BuildingType;
  level: number;
}

export interface PlayerStateDTO {
  player: PlayerDTO;
  base: BaseDTO;
  resources: ResourceMap;
}
