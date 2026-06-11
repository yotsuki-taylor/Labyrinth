import { create } from 'zustand';
import { api } from '../api/client.js';
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
  moveToNode: (targetNodeId: string) => Promise<void>;
  performCombatAction: (action: string, targetId?: string) => Promise<void>;
  extract: () => Promise<void>;
  refreshCombat: (combatId: string) => Promise<void>;
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
      const [me, base] = await Promise.all([
        api.get<{ player: { id: string; username: string }; resources: ResourceMap; heroes: HeroDTO[] }>('/player/me'),
        api.get<{ buildings: BuildingDTO[] }>('/base'),
      ]);
      set({
        playerId: me.player.id,
        username: me.player.username,
        resources: me.resources,
        heroes: me.heroes,
        buildings: base.buildings,
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
      const result = await api.post<{ resources: ResourceMap; building: BuildingDTO }>(
        '/base/upgrade',
        { buildingType },
      );
      set((s) => ({
        resources: result.resources,
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
      const expedition = await api.post<ExpeditionDTO>('/expedition/start', { heroIds });
      set({ expedition, screen: 'labyrinth_run' });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  moveToNode: async (targetNodeId) => {
    const { expedition } = get();
    if (!expedition) return;
    set({ loading: true, error: null });
    try {
      const result = await api.post<{
        expedition: ExpeditionDTO;
        event: string;
        combatId?: string;
        loot?: Partial<ResourceMap>;
      }>('/expedition/move', { expeditionId: expedition.id, targetNodeId });

      set({ expedition: result.expedition });

      if (result.event === 'combat_started' && result.combatId) {
        const combat = await api.get<CombatDTO>(`/combat/${result.combatId}`);
        set({ combat, screen: 'combat' });
      } else if (result.event === 'exited') {
        set({ screen: 'labyrinth_run' }); // Will show extract button
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
      const result = await api.post<{ combat: CombatDTO }>('/combat/action', {
        combatId: combat.id,
        action,
        targetId,
      });
      set({ combat: result.combat });

      if (result.combat.status === 'victory') {
        // Return to labyrinth
        const expedition = await api.get<ExpeditionDTO>('/expedition/current');
        set({ expedition, screen: 'labyrinth_run', combat: null });
      } else if (result.combat.status === 'defeat') {
        set({
          screen: 'results',
          combat: null,
          expedition: null,
          lastResult: { success: false, loot: {}, message: 'Your party was defeated. All loot lost.' },
        });
        await get().loadPlayerState();
      }
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  extract: async () => {
    const { expedition } = get();
    if (!expedition) return;
    set({ loading: true, error: null });
    try {
      const result = await api.post<{ success: boolean; lootGained: Partial<ResourceMap>; message: string }>(
        '/expedition/extract',
        { expeditionId: expedition.id },
      );
      set({
        screen: 'results',
        expedition: null,
        lastResult: { success: result.success, loot: result.lootGained, message: result.message },
      });
      await get().loadPlayerState();
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  refreshCombat: async (combatId) => {
    const combat = await api.get<CombatDTO>(`/combat/${combatId}`);
    set({ combat });
  },
}));
