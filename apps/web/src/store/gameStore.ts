import { create } from 'zustand';
import { engine } from '../game/engine.js';
import type {
  ResourceMap,
  HeroDTO,
  ExpeditionDTO,
  CombatDTO,
  BuildingDTO,
} from '@labyrinth/shared';

export type Screen =
  | 'base'
  | 'expedition_prep'
  | 'labyrinth_run'
  | 'combat'
  | 'results'
  | 'profile';

interface GameState {
  // Navigation
  screen: Screen;
  setScreen: (s: Screen) => void;

  // Player data
  playerId: string | null;
  username: string;
  resources: ResourceMap;
  heroes: HeroDTO[];
  buildings: BuildingDTO[];

  // Active game state
  expedition: ExpeditionDTO | null;
  combat: CombatDTO | null;
  lastResult: { success: boolean; loot: Partial<ResourceMap>; message: string } | null;

  // Loading / errors
  loading: boolean;
  error: string | null;

  // Actions
  loadPlayerState: () => Promise<void>;
  upgradeBuilding: (buildingType: string) => Promise<void>;
  startExpedition: (heroIds: string[]) => Promise<void>;
  collectPickup: (pickupId: string) => Promise<void>;
  enterExit: (exitId: string) => Promise<void>;
  performCombatAction: (action: string, targetId?: string) => Promise<void>;
  refreshCombat: (combatId: string) => Promise<void>;
  reviveHero: (heroId: string) => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'base',
  setScreen: (screen) => set({ screen }),

  playerId: null,
  username: '',
  resources: { gold: 0, stone: 0, iron: 0, essence: 0, relics: 0 },
  heroes: [],
  buildings: [],

  expedition: null,
  combat: null,
  lastResult: null,

  loading: false,
  error: null,

  loadPlayerState: async () => {
    set({ loading: true, error: null });
    try {
      await engine.init();
      const state = engine.getState();
      set({
        playerId: state.playerId,
        username: state.username,
        resources: state.resources,
        heroes: state.heroes,
        buildings: state.buildings,
      });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  upgradeBuilding: async (buildingType) => {
    set({ loading: true, error: null });
    try {
      const result = await engine.upgradeBuilding(buildingType);
      set((s) => ({
        resources: result.resources,
        heroes: result.heroes,
        buildings: s.buildings.map((b) =>
          b.type === buildingType ? result.building : b,
        ),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  startExpedition: async (heroIds) => {
    set({ loading: true, error: null });
    try {
      const expedition = await engine.startExpedition(heroIds);
      set({ expedition, screen: 'labyrinth_run' });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  // Collecting a pickup is a high-frequency action; keep it light (no global loading).
  collectPickup: async (pickupId) => {
    const { expedition } = get();
    if (!expedition) return;
    try {
      const result = await engine.collectPickup(pickupId);
      set({ expedition: result.expedition });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  enterExit: async (exitId) => {
    const { expedition } = get();
    if (!expedition) return;
    set({ loading: true, error: null });
    try {
      const result = await engine.enterExit(exitId);
      if (result.extracted && result.extract) {
        set({
          expedition: null,
          screen: 'results',
          lastResult: { success: result.extract.success, loot: result.extract.lootGained, message: result.extract.message },
        });
        await get().loadPlayerState();
      } else {
        set({ expedition: result.expedition });
      }
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  performCombatAction: async (action, targetId) => {
    const { combat } = get();
    if (!combat) return;
    set({ loading: true, error: null });
    try {
      const result = await engine.combatAction(action as 'attack' | 'ability' | 'defend', targetId);
      set({ combat: result.combat });

      if (result.combat.status === 'victory') {
        const expedition = engine.getCurrentExpedition();
        const state = engine.getState();
        set({ expedition, screen: 'labyrinth_run', combat: null, heroes: state.heroes, resources: state.resources });
      } else if (result.combat.status === 'defeat') {
        set({
          screen: 'results',
          combat: null,
          expedition: null,
          lastResult: { success: false, loot: {}, message: 'Your hero fell in the labyrinth. All loot lost.' },
        });
        await get().loadPlayerState();
      }
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  refreshCombat: async (combatId) => {
    const combat = engine.getCombat(combatId);
    set({ combat });
  },

  reviveHero: async (heroId) => {
    set({ loading: true, error: null });
    try {
      const result = await engine.reviveHero(heroId);
      set({ heroes: result.heroes, resources: result.resources });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },
}));
