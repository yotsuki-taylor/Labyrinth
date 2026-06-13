export type HeroClass =
  | 'warrior'
  | 'ranger'
  | 'warlock'
  | 'cleric'
  | 'assassin'
  | 'sorcerer'
  | 'paladin'
  | 'barbarian'
  | 'druid'
  | 'bard'
  | 'alchemist'
  | 'inventor';

export const HERO_CLASSES: HeroClass[] = [
  'warrior', 'ranger', 'warlock', 'cleric',
  'assassin', 'sorcerer', 'paladin', 'barbarian',
  'druid', 'bard', 'alchemist', 'inventor',
];

export interface HeroStats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface HeroTemplateConfig {
  class: HeroClass;
  label: string;
  description: string;
  baseStats: HeroStats;
  ability: string;
}

export const HERO_TEMPLATES: Record<HeroClass, HeroTemplateConfig> = {
  warrior: {
    class: 'warrior',
    label: 'Warrior',
    description: 'Heavily armored frontliner. High HP and defense.',
    ability: 'Shield Wall — takes a defensive stance, reducing incoming damage.',
    baseStats: { hp: 120, maxHp: 120, attack: 15, defense: 20, speed: 5 },
  },
  ranger: {
    class: 'ranger',
    label: 'Ranger',
    description: 'Swift ranged attacker. High speed and attack.',
    ability: 'Aimed Shot — deals 2× ATK damage to one enemy.',
    baseStats: { hp: 80, maxHp: 80, attack: 25, defense: 8, speed: 12 },
  },
  warlock: {
    class: 'warlock',
    label: 'Warlock',
    description: 'Dark arcane caster. Low HP but devastating burst.',
    ability: 'Void Blast — deals 30 damage to all enemies.',
    baseStats: { hp: 60, maxHp: 60, attack: 30, defense: 5, speed: 10 },
  },
  cleric: {
    class: 'cleric',
    label: 'Cleric',
    description: 'Holy support. Heals allies and sustains the party.',
    ability: 'Field Heal — restores 25 HP to the hero with lowest HP.',
    baseStats: { hp: 75, maxHp: 75, attack: 10, defense: 10, speed: 9 },
  },
  assassin: {
    class: 'assassin',
    label: 'Assassin',
    description: 'Shadow striker. Extreme single-target burst damage.',
    ability: 'Backstab — deals 3× ATK to one enemy.',
    baseStats: { hp: 70, maxHp: 70, attack: 32, defense: 6, speed: 15 },
  },
  sorcerer: {
    class: 'sorcerer',
    label: 'Sorcerer',
    description: 'Arcane specialist. Fixed magic damage ignores armor.',
    ability: 'Arcane Nova — deals 25 fixed damage to all enemies.',
    baseStats: { hp: 55, maxHp: 55, attack: 28, defense: 4, speed: 11 },
  },
  paladin: {
    class: 'paladin',
    label: 'Paladin',
    description: 'Holy warrior. Combines combat with divine healing.',
    ability: 'Blessed Light — heals 20 HP to the hero with lowest HP.',
    baseStats: { hp: 110, maxHp: 110, attack: 12, defense: 18, speed: 6 },
  },
  barbarian: {
    class: 'barbarian',
    label: 'Barbarian',
    description: 'Primal berserker. The highest HP of any hero.',
    ability: 'Berserker Slash — deals 2× ATK damage to one enemy.',
    baseStats: { hp: 140, maxHp: 140, attack: 22, defense: 12, speed: 7 },
  },
  druid: {
    class: 'druid',
    label: 'Druid',
    description: "Nature's guardian. Damages enemies and heals self.",
    ability: "Nature's Wrath — 20 damage to all enemies, heals self 15 HP.",
    baseStats: { hp: 65, maxHp: 65, attack: 14, defense: 8, speed: 8 },
  },
  bard: {
    class: 'bard',
    label: 'Bard',
    description: 'Inspiring performer. Restores HP to the entire party.',
    ability: 'Battle Hymn — restores 10 HP to all heroes.',
    baseStats: { hp: 70, maxHp: 70, attack: 8, defense: 10, speed: 10 },
  },
  alchemist: {
    class: 'alchemist',
    label: 'Alchemist',
    description: 'Explosive chemist. Fixed-damage bombs bypass defense.',
    ability: 'Explosive Vial — 40 fixed damage to one enemy (bypasses defense).',
    baseStats: { hp: 65, maxHp: 65, attack: 18, defense: 8, speed: 9 },
  },
  inventor: {
    class: 'inventor',
    label: 'Inventor',
    description: 'Mechanical genius. Deploys tech to hit all enemies.',
    ability: 'Mechanical Swarm — deals 15 damage to all enemies.',
    baseStats: { hp: 75, maxHp: 75, attack: 20, defense: 7, speed: 11 },
  },
};

export interface HeroDTO {
  id: string;
  name: string;
  class: HeroClass;
  level: number;
  xp: number;
  isAlive: boolean;
  /** Unix timestamp (ms) when the hero auto-revives; undefined if alive or pending manual revive. */
  reviveAt?: number;
  stats: HeroStats;
}
