import {
  HERO_TEMPLATES,
  BUILDING_CONFIGS,
  BUILDING_TYPES,
  canAfford,
  subtractCost,
} from '@labyrinth/shared';
import type {
  ResourceMap,
  HeroDTO,
  HeroStats,
  HeroClass,
  BuildingDTO,
  ExpeditionDTO,
  CombatDTO,
  CombatParticipantDTO,
  CombatActionType,
  ResourceType,
} from '@labyrinth/shared';
import type { SaveState, HeroSave, ExpeditionSave, CombatSave } from './state.js';
import { SAVE_VERSION, metaOf } from './state.js';
import { generateLabyrinth } from './labyrinth.js';
import {
  generateEnemy,
  processCombatAction,
  applyUpdates,
  evaluateOutcome,
  getActiveParticipantId,
} from './combat.js';
import { loadLocal, saveLocal, loadCloudMeta, saveCloudMeta } from './storage.js';

const STARTER_HEROES: { class: HeroClass; name: string }[] = [
  { class: 'guardian', name: 'Aldric' },
  { class: 'ranger', name: 'Sylva' },
  { class: 'occultist', name: 'Morvyn' },
  { class: 'medic', name: 'Eryn' },
];

function newId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}

function telegramUsername(): string {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return u?.username ?? u?.first_name ?? 'Adventurer';
}

/** Derives display stats from a hero's class and level (matches old server math). */
function heroStats(h: HeroSave): HeroStats {
  const base = HERO_TEMPLATES[h.class].baseStats;
  return {
    hp: h.hp,
    maxHp: base.maxHp + (h.level - 1) * 10,
    attack: base.attack + (h.level - 1) * 2,
    defense: base.defense + (h.level - 1) * 1,
    speed: base.speed,
  };
}

function heroToDTO(h: HeroSave): HeroDTO {
  return { id: h.id, name: h.name, class: h.class, level: h.level, xp: h.xp, stats: heroStats(h) };
}

function expeditionToDTO(e: ExpeditionSave): ExpeditionDTO {
  return {
    id: e.id,
    status: e.status,
    currentNodeId: e.currentNodeId,
    nodes: e.nodes,
    heroIds: e.heroIds,
    pendingLoot: e.pendingLoot,
    startedAt: e.startedAt,
  };
}

function combatToDTO(c: CombatSave): CombatDTO {
  return {
    id: c.id,
    status: c.status,
    turn: c.turn,
    activeParticipantId: getActiveParticipantId(c.participants),
    participants: c.participants,
    log: c.log,
  };
}

function createNewSave(): SaveState {
  const heroes: HeroSave[] = STARTER_HEROES.map(({ class: cls, name }) => ({
    id: newId('hero'),
    name,
    class: cls,
    level: 1,
    xp: 0,
    hp: HERO_TEMPLATES[cls].baseStats.maxHp,
    isAlive: true,
  }));

  const buildings: BuildingDTO[] = BUILDING_TYPES.map((type) => ({
    id: newId('bld'),
    type,
    level: 1,
  }));

  return {
    version: SAVE_VERSION,
    updatedAt: Date.now(),
    player: { id: newId('player'), username: telegramUsername(), createdAt: new Date().toISOString() },
    resources: { gold: 200, stone: 100, iron: 50, essence: 5, relics: 0 },
    buildings,
    heroes,
    expedition: null,
    combat: null,
  };
}

class GameEngine {
  private save: SaveState = createNewSave();
  private ready = false;

  /** Loads (or creates) the save, reconciling local and cloud copies. */
  async init(): Promise<void> {
    if (this.ready) return;
    const local = loadLocal();
    const cloudMeta = await loadCloudMeta();

    const localValid = local && local.version === SAVE_VERSION ? local : null;
    const cloudValid = cloudMeta && cloudMeta.version === SAVE_VERSION ? cloudMeta : null;

    if (localValid && cloudValid) {
      // Last write wins on permanent progress. A newer cloud copy means the
      // player progressed on another device, so any stale local run is dropped.
      this.save =
        cloudValid.updatedAt > localValid.updatedAt
          ? { ...cloudValid, expedition: null, combat: null }
          : localValid;
    } else if (cloudValid) {
      this.save = { ...cloudValid, expedition: null, combat: null };
    } else if (localValid) {
      this.save = localValid;
    } else {
      this.save = createNewSave();
    }

    this.ready = true;
    await this.persist();
  }

  private async persist(): Promise<void> {
    this.save.updatedAt = Date.now();
    saveLocal(this.save);
    await saveCloudMeta(metaOf(this.save));
  }

  // --- Reads ---

  getState() {
    return {
      playerId: this.save.player.id,
      username: this.save.player.username,
      resources: this.save.resources,
      heroes: this.save.heroes.map(heroToDTO),
      buildings: this.save.buildings.map((b) => ({ ...b })),
    };
  }

  getCurrentExpedition(): ExpeditionDTO | null {
    const e = this.save.expedition;
    return e && e.status === 'active' ? expeditionToDTO(e) : null;
  }

  getCombat(combatId: string): CombatDTO {
    const c = this.save.combat;
    if (!c || c.id !== combatId) throw new Error('Combat not found');
    return combatToDTO(c);
  }

  // --- Base ---

  async upgradeBuilding(buildingType: string): Promise<{ building: BuildingDTO; resources: ResourceMap }> {
    const config = BUILDING_CONFIGS[buildingType as keyof typeof BUILDING_CONFIGS];
    if (!config) throw new Error(`Unknown building type: ${buildingType}`);

    const building = this.save.buildings.find((b) => b.type === buildingType);
    if (!building) throw new Error('Building not found');
    if (building.level >= config.maxLevel) throw new Error('Building already at max level');

    const cost = config.upgradeCost(building.level);
    if (!canAfford(this.save.resources, cost)) throw new Error('Insufficient resources');

    this.save.resources = subtractCost(this.save.resources, cost);
    building.level += 1;
    await this.persist();

    return { building: { ...building }, resources: { ...this.save.resources } };
  }

  // --- Expedition ---

  async startExpedition(heroIds: string[]): Promise<ExpeditionDTO> {
    if (!heroIds || heroIds.length === 0) throw new Error('Select at least one hero');

    const valid = heroIds.filter((id) => this.save.heroes.some((h) => h.id === id && h.isAlive && h.hp > 0));
    if (valid.length !== heroIds.length) throw new Error('Invalid or dead heroes selected');

    const mapRoom = this.save.buildings.find((b) => b.type === 'map_room');
    const nodes = generateLabyrinth(mapRoom?.level ?? 1);

    this.save.expedition = {
      id: newId('exp'),
      status: 'active',
      currentNodeId: nodes[0].id,
      startedAt: new Date().toISOString(),
      heroIds: valid,
      nodes,
      pendingLoot: {},
    };
    this.save.combat = null;
    await this.persist();

    return expeditionToDTO(this.save.expedition);
  }

  async move(targetNodeId: string): Promise<{
    expedition: ExpeditionDTO;
    event: 'moved' | 'loot_found' | 'combat_started' | 'exited';
    combatId?: string;
    loot?: Partial<ResourceMap>;
  }> {
    const e = this.save.expedition;
    if (!e || e.status !== 'active') throw new Error('Expedition is not active');

    const currentNode = e.nodes.find((n) => n.id === e.currentNodeId);
    if (!currentNode) throw new Error('Current node not found');
    if (!currentNode.connections.includes(targetNodeId)) {
      throw new Error('Target node is not connected to current node');
    }

    const targetNode = e.nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) throw new Error('Target node not found');

    const wasVisited = targetNode.visited;
    targetNode.visited = true;
    e.currentNodeId = targetNode.id;

    let event: 'moved' | 'loot_found' | 'combat_started' | 'exited' = 'moved';
    let combatId: string | undefined;
    let loot: Partial<ResourceMap> | undefined;

    if (targetNode.type === 'loot' && !wasVisited) {
      loot = targetNode.loot ?? {};
      for (const [k, v] of Object.entries(loot)) {
        const key = k as ResourceType;
        e.pendingLoot[key] = (e.pendingLoot[key] ?? 0) + (v ?? 0);
      }
      event = 'loot_found';
    } else if (targetNode.type === 'pve_combat' && !wasVisited) {
      combatId = this.startCombat(targetNode.id);
      event = 'combat_started';
    } else if (targetNode.type === 'exit') {
      event = 'exited';
    }

    await this.persist();
    return { expedition: expeditionToDTO(e), event, combatId, loot };
  }

  private startCombat(nodeId: string): string {
    const e = this.save.expedition!;
    const nodeIndex = e.nodes.findIndex((n) => n.id === nodeId);
    const heroes = this.save.heroes.filter((h) => e.heroIds.includes(h.id) && h.isAlive);

    const heroParticipants: CombatParticipantDTO[] = heroes.map((h) => {
      const stats = heroStats(h);
      return {
        id: newId('cp'),
        type: 'hero',
        name: h.name,
        hp: stats.maxHp, // heroes enter each fight at full HP (matches server)
        maxHp: stats.maxHp,
        attack: stats.attack,
        defense: stats.defense,
        speed: stats.speed,
        isAlive: true,
        heroId: h.id,
      };
    });

    const enemy = generateEnemy(nodeIndex);
    const enemyParticipant: CombatParticipantDTO = { id: newId('cp'), ...enemy };

    const combat: CombatSave = {
      id: newId('combat'),
      expeditionId: e.id,
      nodeId,
      status: 'active',
      turn: 1,
      participants: [...heroParticipants, enemyParticipant],
      log: [],
    };
    this.save.combat = combat;
    return combat.id;
  }

  async combatAction(action: CombatActionType, targetId?: string): Promise<{ combat: CombatDTO }> {
    const c = this.save.combat;
    if (!c) throw new Error('Combat not found');
    if (c.status !== 'active') throw new Error('Combat is not active');

    const actorId = getActiveParticipantId(c.participants);
    if (!actorId) throw new Error('No active participant');

    const { updatedParticipants, newLog } = processCombatAction(c.participants, c.turn, action, targetId, actorId);
    applyUpdates(c.participants, updatedParticipants);
    c.log = [...c.log, ...newLog];
    c.turn += 1;
    c.status = evaluateOutcome(c.participants);

    const result = combatToDTO(c);

    if (c.status === 'defeat') {
      // Lose the run and the heroes who were on it (permadeath).
      const e = this.save.expedition;
      if (e) {
        for (const id of e.heroIds) {
          const h = this.save.heroes.find((x) => x.id === id);
          if (h) {
            h.hp = 0;
            h.isAlive = false;
          }
        }
      }
      this.save.expedition = null;
      this.save.combat = null;
    } else if (c.status === 'victory') {
      this.save.combat = null;
    }

    await this.persist();
    return { combat: result };
  }

  async extract(): Promise<{ success: boolean; lootGained: Partial<ResourceMap>; message: string }> {
    const e = this.save.expedition;
    if (!e || e.status !== 'active') throw new Error('Expedition already ended');

    const currentNode = e.nodes.find((n) => n.id === e.currentNodeId);
    if (currentNode?.type !== 'exit') throw new Error('Must be on an exit node to extract');

    const loot = { ...e.pendingLoot };
    for (const [k, v] of Object.entries(loot)) {
      const key = k as ResourceType;
      this.save.resources[key] = (this.save.resources[key] ?? 0) + (v ?? 0);
    }

    this.save.expedition = null;
    await this.persist();

    return { success: true, lootGained: loot, message: 'Extraction successful! Loot secured.' };
  }
}

export const engine = new GameEngine();
