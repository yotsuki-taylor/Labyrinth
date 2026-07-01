import type { RunStatsSave } from './state.js';

/** A single achievement whose progress is derived from lifetime stats. */
export interface Achievement {
  id: string;
  name: string;
  icon: string;
  desc: string;
  goal: number;
  progress: (s: RunStatsSave) => number;
}

/**
 * Achievements are computed purely from cumulative RunStatsSave, so no extra
 * persistence is needed — an achievement is "unlocked" once progress ≥ goal.
 */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood',   name: 'First Blood',    icon: '⚔️', desc: 'Slay your first monster',   goal: 1,   progress: (s) => s.monstersSlain },
  { id: 'monster_hunter', name: 'Monster Hunter', icon: '🗡️', desc: 'Slay 100 monsters',        goal: 100, progress: (s) => s.monstersSlain },
  { id: 'slayer',        name: 'Slayer',         icon: '💥', desc: 'Slay 500 monsters',         goal: 500, progress: (s) => s.monstersSlain },
  { id: 'boss_first',    name: 'Keeper Killer',  icon: '👹', desc: 'Defeat your first boss',    goal: 1,   progress: (s) => s.bossesSlain },
  { id: 'boss_master',   name: 'Labyrinth Bane', icon: '☠️', desc: 'Defeat 10 bosses',          goal: 10,  progress: (s) => s.bossesSlain },
  { id: 'first_extract', name: 'Escape Artist',  icon: '🚪', desc: 'Extract successfully once', goal: 1,   progress: (s) => s.runsExtracted },
  { id: 'rich',          name: 'Treasure Hunter', icon: '💰', desc: 'Extract 10 times',         goal: 10,  progress: (s) => s.runsExtracted },
  { id: 'explorer',      name: 'Explorer',       icon: '🗺️', desc: 'Explore 50 rooms',          goal: 50,  progress: (s) => s.roomsExplored },
  { id: 'delver',        name: 'Deep Delver',    icon: '⬇️', desc: 'Reach depth 8',             goal: 8,   progress: (s) => s.deepestDepth },
  { id: 'empowered',     name: 'Empowered',      icon: '🔮', desc: 'Gain 10 abilities',         goal: 10,  progress: (s) => s.abilitiesGained },
  { id: 'veteran',       name: 'Veteran',        icon: '🏁', desc: 'Start 25 runs',             goal: 25,  progress: (s) => s.runsStarted },
];

export function isUnlocked(a: Achievement, s: RunStatsSave): boolean {
  return a.progress(s) >= a.goal;
}

/** Returns the ids of all achievements currently unlocked by the given stats. */
export function unlockedIds(s: RunStatsSave): string[] {
  return ACHIEVEMENTS.filter((a) => isUnlocked(a, s)).map((a) => a.id);
}
