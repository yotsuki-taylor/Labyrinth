export type HeroClass = 'guardian' | 'ranger' | 'occultist' | 'medic';

export const HERO_CLASSES: HeroClass[] = ['guardian', 'ranger', 'occultist', 'medic'];

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
  guardian: {
    class: 'guardian',
    label: 'Guardian',
    description: 'Heavily armored frontliner. High HP and defense.',
    ability: 'Shield Wall — reduces all incoming damage by 50% for 1 turn.',
    baseStats: { hp: 120, maxHp: 120, attack: 15, defense: 20, speed: 5 },
  },
  ranger: {
    class: 'ranger',
    label: 'Ranger',
    description: 'Swift ranged attacker. High speed and attack.',
    ability: 'Aimed Shot — deals 2× attack damage to one enemy.',
    baseStats: { hp: 80, maxHp: 80, attack: 25, defense: 8, speed: 12 },
  },
  occultist: {
    class: 'occultist',
    label: 'Occultist',
    description: 'Arcane damage dealer. Low HP but high burst.',
    ability: 'Void Blast — deals 30 damage to all enemies.',
    baseStats: { hp: 60, maxHp: 60, attack: 30, defense: 5, speed: 10 },
  },
  medic: {
    class: 'medic',
    label: 'Medic',
    description: 'Support hero. Heals allies and buffs survival.',
    ability: 'Field Heal — restores 25 HP to the hero with lowest HP.',
    baseStats: { hp: 75, maxHp: 75, attack: 10, defense: 10, speed: 9 },
  },
};

export interface HeroDTO {
  id: string;
  name: string;
  class: HeroClass;
  level: number;
  xp: number;
  stats: HeroStats;
}
