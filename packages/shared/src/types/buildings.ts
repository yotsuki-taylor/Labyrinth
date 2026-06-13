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
  /** Human-readable description of the effect at the given level. */
  effectAt: (level: number) => string;
}

export const BUILDING_CONFIGS: Record<BuildingType, BuildingConfig> = {
  town_hall: {
    type: 'town_hall',
    label: 'Town Hall',
    description: 'Heart of your base. Limits max level of all other buildings.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 100, stone: lvl * 50 }),
    effectAt: (lvl) => `Other buildings: max level ${lvl}`,
  },
  barracks: {
    type: 'barracks',
    label: 'Barracks',
    description: 'Reduces hero recovery time after death.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 60, stone: lvl * 30 }),
    effectAt: (lvl) => `Recovery time: ${Math.round(60 * Math.max(0.2, 1 - (lvl - 1) * 0.2))} min`,
  },
  forge: {
    type: 'forge',
    label: 'Forge',
    description: 'Equips all heroes with better gear, boosting ATK and DEF.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 80, iron: lvl * 40 }),
    effectAt: (lvl) => lvl === 1 ? 'No bonus yet' : `+${(lvl - 1) * 3} ATK & DEF for all heroes`,
  },
  laboratory: {
    type: 'laboratory',
    label: 'Laboratory',
    description: 'Research passive bonuses that amplify combat XP.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 70, essence: lvl * 20 }),
    effectAt: (lvl) => lvl === 1 ? 'No bonus yet' : `+${(lvl - 1) * 20}% XP from combat`,
  },
  storage: {
    type: 'storage',
    label: 'Storage',
    description: 'Raises the cap on how many resources you can hold.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 40, stone: lvl * 60 }),
    effectAt: (lvl) => {
      const caps = [1000, 2000, 5000, 10000];
      return lvl >= 5 ? 'Cap: unlimited' : `Cap: ${caps[lvl - 1]} per resource`;
    },
  },
  map_room: {
    type: 'map_room',
    label: 'Map Room',
    description: 'Reveals larger labyrinths with more loot nodes.',
    maxLevel: 5,
    upgradeCost: (lvl) => ({ gold: lvl * 90, relics: lvl * 5 }),
    effectAt: (lvl) => `${9 + lvl} nodes, ${25 + (lvl - 1) * 4}% loot chance`,
  },
};
