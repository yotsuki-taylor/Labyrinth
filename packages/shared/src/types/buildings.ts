import type { ResourceMap } from './resources.js';

export type BuildingType =
  | 'town_hall'
  | 'barracks'
  | 'forge'
  | 'laboratory'
  | 'storage'
  | 'map_room';

export const BUILDING_TYPES: BuildingType[] = [
  'town_hall', 'barracks', 'forge', 'laboratory', 'storage', 'map_room',
];

export interface BuildingConfig {
  type: BuildingType;
  label: string;
  description: string;
  maxLevel: number;
  upgradeCost: (level: number) => Partial<ResourceMap>;
}

export const BUILDING_CONFIGS: Record<BuildingType, BuildingConfig> = {
  town_hall: {
    type: 'town_hall',
    label: 'Town Hall',
    description: 'Heart of your base. Determines max building levels.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 100, stone: lvl * 50 }),
  },
  barracks: {
    type: 'barracks',
    label: 'Barracks',
    description: 'Train and upgrade heroes.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 60, stone: lvl * 30 }),
  },
  forge: {
    type: 'forge',
    label: 'Forge',
    description: 'Craft equipment for heroes.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 80, iron: lvl * 40 }),
  },
  laboratory: {
    type: 'laboratory',
    label: 'Laboratory',
    description: 'Research passive bonuses using essence.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 70, essence: lvl * 20 }),
  },
  storage: {
    type: 'storage',
    label: 'Storage',
    description: 'Increases max resource capacity.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 40, stone: lvl * 60 }),
  },
  map_room: {
    type: 'map_room',
    label: 'Map Room',
    description: 'Unlocks larger labyrinth maps and rare nodes.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 90, relics: lvl * 5 }),
  },
};
