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
  ExpeditionRoomDTO,
  ExtractResult,
  CombatDTO,
  CombatActionType,
  ResourceType,
} from '@labyrinth/shared';
import type { SaveState, HeroSave, ExpeditionSave, CombatSave, MetaSave } from './state.js';
import { SAVE_VERSION, metaOf } from './state.js';
import { generateRoom, generateStartRoom, runDepth } from './labyrinth.js';
import { processCombatAction, applyUpdates, evaluateOutcome } from './combat.js';
import { loadLocal, saveLocal, loadCloudMeta, saveCloudMeta } from './storage.js';

const XP_PER_ROOM = 20;
const XP_TO_LEVEL = (level: number) => level * 100;
const REVIVE_TIME_MS = 60 * 60 * 1000; // 1 hour
export const REVIVE_GOLD_COST = 100;

export const BARRACKS_UNLOCKS: Record<number, { class: HeroClass; name: string }[]> = {
  2: [{ class: 'assassin', name: 'Zara' }, { class: 'sorcerer', name: 'Ignis' }],
  3: [{ class: 'paladin', name: 'Theron' }, { class: 'barbarian', name: 'Grak' }],
  4: [{ class: 'druid', name: 'Willow' }, { class: 'bard', name: 'Lyric' }],
  5: [{ class: 'alchemist', name: 'Vesper' }, { class: 'inventor', name: 'Cog' }],
};

function migrateSave(raw: Record<string, any>): void {
  // v1 → v2: rename guardian/occultist/medic to warrior/warlock/cleric
  if (raw.version === 1) {
    const renames: Record<string, string> = { guardian: 'warrior', occultist: 'warlock', medic: 'cleric' };
    for (const h of raw.heroes ?? []) {
      if (renames[h.class]) h.class = renames[h.class];
    }
    const barracksLevel = (raw.buildings ?? []).find((b: any) => b.type === 'barracks')?.level ?? 1;
    const existingClasses = new Set((raw.heroes ?? []).map((h: any) => h.class));
    for (const [lvlStr, pool] of Object.entries(BARRACKS_UNLOCKS)) {
      if (barracksLevel >= Number(lvlStr)) {
        for (const { class: cls, name } of pool) {
          if (!existingClasses.has(cls)) {
            raw.heroes.push({
              id: newId('hero'), name, class: cls, level: 1, xp: 0,
              hp: HERO_TEMPLATES[cls as HeroClass].baseStats.maxHp, isAlive: true,
            });
            existingClasses.add(cls);
          }
        }
      }
    }
    raw.version = 2;
  }
  // v2 → v3 and v3 → v4: expedition model changed; clear any in-progress run.
  if (raw.version === 2 || raw.version === 3) {
    raw.expedition = null;
    raw.combat = null;
    raw.version = 4;
  }
  // v4 → v5: rooms now include walls; clear stale expedition so it regenerates.
  if (raw.version === 4) {
    raw.expedition = null;
    raw.version = 5;
  }
}

const STARTER_HEROES: { class: HeroClass; name: string }[] = [
  { class: 'warrior', name: 'Aldric' },
  { class: 'ranger', name: 'Sylva' },
  { class: 'warlock', name: 'Morvyn' },
  { class: 'cleric', name: 'Eryn' },
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

/** Derives display stats from a hero's class and level. forgeLevel applies equipment bonus. */
function heroStats(h: HeroSave, forgeLevel = 1): HeroStats {
  const base = HERO_TEMPLATES[h.class].baseStats;
  const forgeBonus = (forgeLevel - 1) * 3;
  return {
    hp: h.hp,
    maxHp: base.maxHp + (h.level - 1) * 10,
    attack: base.attack + (h.level - 1) * 2 + forgeBonus,
    defense: base.defense + (h.level - 1) * 1 + forgeBonus,
    speed: base.speed,
  };
}

const STORAGE_CAPS = [1000, 2000, 5000, 10000, Infinity];

function heroToDTO(h: HeroSave, forgeLevel = 1): HeroDTO {
  return {
    id: h.id,
    name: h.name,
    class: h.class,
    level: h.level,
    xp: h.xp,
    isAlive: h.isAlive,
    reviveAt: h.reviveAt,
    stats: heroStats(h, forgeLevel),
  };
}

function expeditionToDTO(e: ExpeditionSave): ExpeditionDTO {
  return {
    id: e.id,
    status: e.status,
    heroId: e.heroId,
    room: e.room,
    pendingLoot: e.pendingLoot,
    depth: e.depth,
    maxDepth: e.maxDepth,
    startedAt: e.startedAt,
  };
}

function combatToDTO(c: CombatSave): CombatDTO {
  const activeParticipantId =
    c.turnQueue.find(id => {
      const p = c.participants.find(x => x.id === id);
      return p && p.isAlive && p.type === 'hero';
    }) ?? '';
  return {
    id: c.id,
    status: c.status,
    turn: c.turn,
    activeParticipantId,
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

  private bldLevel(type: string): number {
    return this.save.buildings.find((b) => b.type === type)?.level ?? 1;
  }

  /** Auto-runs enemy (and round-start) turns until it's a hero's turn again. */
  private processEnemyTurns(c: CombatSave): void {
    while (c.status === 'active') {
      c.turnQueue = c.turnQueue.filter(id => c.participants.find(p => p.id === id && p.isAlive));
      if (c.turnQueue.length === 0) {
        c.turnQueue = [...c.participants]
          .filter(p => p.isAlive)
          .sort((a, b) => b.speed - a.speed)
          .map(p => p.id);
      }
      const next = c.participants.find(p => p.id === c.turnQueue[0]);
      if (!next || !next.isAlive || next.type === 'hero') break;
      c.turnQueue.shift();

      const heroTarget = [...c.participants]
        .filter(p => p.type === 'hero' && p.isAlive)
        .sort((a, b) => a.hp - b.hp)[0];
      if (!heroTarget) break;

      const { updatedParticipants, newLog } = processCombatAction(
        c.participants, c.turn, 'attack', heroTarget.id, next.id,
      );
      applyUpdates(c.participants, updatedParticipants);
      c.log = [...c.log, ...newLog];
      c.turn += 1;
      c.status = evaluateOutcome(c.participants);
    }
  }

  /** Loads (or creates) the save, reconciling local and cloud copies. */
  async init(): Promise<void> {
    if (this.ready) return;
    const rawLocal = loadLocal() as any;
    const rawCloud = await loadCloudMeta() as any;

    if (rawLocal) migrateSave(rawLocal);
    if (rawCloud) migrateSave(rawCloud);

    const local = rawLocal && rawLocal.version === SAVE_VERSION ? rawLocal as SaveState : null;
    const cloud = rawCloud && rawCloud.version === SAVE_VERSION ? rawCloud as MetaSave : null;

    if (local && cloud) {
      this.save =
        cloud.updatedAt > local.updatedAt
          ? { ...cloud, expedition: null, combat: null }
          : local;
    } else if (cloud) {
      this.save = { ...cloud, expedition: null, combat: null };
    } else if (local) {
      this.save = local;
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
    // Auto-revive heroes whose recovery timer has elapsed.
    const now = Date.now();
    let dirty = false;
    for (const h of this.save.heroes) {
      if (!h.isAlive && h.reviveAt !== undefined && now >= h.reviveAt) {
        h.isAlive = true;
        h.hp = heroStats(h).maxHp;
        h.reviveAt = undefined;
        dirty = true;
      }
    }
    if (dirty) void this.persist();

    const forge = this.bldLevel('forge');
    return {
      playerId: this.save.player.id,
      username: this.save.player.username,
      resources: this.save.resources,
      heroes: this.save.heroes.map((h) => heroToDTO(h, forge)),
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

  async upgradeBuilding(buildingType: string): Promise<{ building: BuildingDTO; resources: ResourceMap; heroes: HeroDTO[] }> {
    const config = BUILDING_CONFIGS[buildingType as keyof typeof BUILDING_CONFIGS];
    if (!config) throw new Error(`Unknown building type: ${buildingType}`);

    const building = this.save.buildings.find((b) => b.type === buildingType);
    if (!building) throw new Error('Building not found');
    if (building.level >= config.maxLevel) throw new Error('Building already at max level');

    if (buildingType !== 'town_hall') {
      const thLevel = this.bldLevel('town_hall');
      if (building.level >= thLevel) {
        throw new Error(`Upgrade Town Hall to level ${building.level + 1} first`);
      }
    }

    const cost = config.upgradeCost(building.level);
    if (!canAfford(this.save.resources, cost)) throw new Error('Insufficient resources');

    this.save.resources = subtractCost(this.save.resources, cost);
    building.level += 1;

    if (buildingType === 'barracks') {
      const pool = BARRACKS_UNLOCKS[building.level] ?? [];
      const existingClasses = new Set(this.save.heroes.map((h) => h.class));
      for (const { class: cls, name } of pool) {
        if (!existingClasses.has(cls)) {
          this.save.heroes.push({
            id: newId('hero'), name, class: cls, level: 1, xp: 0,
            hp: HERO_TEMPLATES[cls].baseStats.maxHp, isAlive: true,
          });
        }
      }
    }

    await this.persist();

    const forge = this.bldLevel('forge');
    return { building: { ...building }, resources: { ...this.save.resources }, heroes: this.save.heroes.map((h) => heroToDTO(h, forge)) };
  }

  // --- Expedition ---

  async startExpedition(heroIds: string[]): Promise<ExpeditionDTO> {
    if (!heroIds || heroIds.length !== 1) throw new Error('Select exactly one hero');
    const heroId = heroIds[0];
    const hero = this.save.heroes.find((h) => h.id === heroId && h.isAlive && h.hp > 0);
    if (!hero) throw new Error('Invalid or dead hero selected');

    const maxDepth = runDepth(this.bldLevel('map_room'));
    const room = generateStartRoom(maxDepth);

    this.save.expedition = {
      id: newId('exp'),
      status: 'active',
      startedAt: new Date().toISOString(),
      heroId,
      depth: 0,
      maxDepth,
      room,
      pendingLoot: {},
    };
    this.save.combat = null;
    await this.persist();

    return expeditionToDTO(this.save.expedition);
  }

  /** Picks up a scattered resource pile by walking over it. */
  async collectPickup(pickupId: string): Promise<{ expedition: ExpeditionDTO; resource?: ResourceType; amount?: number }> {
    const e = this.save.expedition;
    if (!e || e.status !== 'active') throw new Error('Expedition is not active');

    const pk = e.room.pickups.find((p) => p.id === pickupId);
    if (!pk || pk.collected) return { expedition: expeditionToDTO(e) };

    pk.collected = true;
    const key = pk.resource;
    e.pendingLoot[key] = (e.pendingLoot[key] ?? 0) + pk.amount;

    await this.persist();
    return { expedition: expeditionToDTO(e), resource: pk.resource, amount: pk.amount };
  }

  /** Walks through one of the two doors: either descends to a new room or extracts. */
  async enterExit(exitId: string): Promise<{ expedition: ExpeditionDTO | null; extracted: boolean; extract?: ExtractResult }> {
    const e = this.save.expedition;
    if (!e || e.status !== 'active') throw new Error('Expedition is not active');

    const exit = e.room.exits.find((x) => x.id === exitId);
    if (!exit) throw new Error('Exit not found');

    if (exit.isExtract) {
      const extract = await this.extract();
      return { expedition: null, extracted: true, extract };
    }

    const nextDepth = e.depth + 1;
    e.depth = nextDepth;
    e.room = generateRoom(nextDepth, e.maxDepth, exit.leadsTo) as ExpeditionRoomDTO;
    await this.persist();
    return { expedition: expeditionToDTO(e), extracted: false };
  }

  async combatAction(action: CombatActionType, targetId?: string): Promise<{ combat: CombatDTO }> {
    const c = this.save.combat;
    if (!c) throw new Error('Combat not found');
    if (c.status !== 'active') throw new Error('Combat is not active');

    c.turnQueue = c.turnQueue.filter(id => c.participants.find(p => p.id === id && p.isAlive));
    if (c.turnQueue.length === 0) {
      c.turnQueue = [...c.participants]
        .filter(p => p.isAlive)
        .sort((a, b) => b.speed - a.speed)
        .map(p => p.id);
    }

    const actorId = c.turnQueue[0];
    if (!actorId) throw new Error('No active participant');
    const actor = c.participants.find(p => p.id === actorId);
    if (!actor || actor.type !== 'hero') throw new Error('Not a hero turn');

    c.turnQueue.shift();

    const { updatedParticipants, newLog } = processCombatAction(
      c.participants, c.turn, action, targetId, actorId,
    );
    applyUpdates(c.participants, updatedParticipants);
    c.log = [...c.log, ...newLog];
    c.turn += 1;
    c.status = evaluateOutcome(c.participants);

    if (c.status === 'active') this.processEnemyTurns(c);

    const result = combatToDTO(c);

    if (c.status === 'defeat') {
      const barracks = this.bldLevel('barracks');
      const reviveMs = REVIVE_TIME_MS * Math.max(0.2, 1 - (barracks - 1) * 0.2);
      for (const p of c.participants) {
        if (p.type === 'hero' && p.heroId) {
          const h = this.save.heroes.find((x) => x.id === p.heroId);
          if (h) { h.hp = 0; h.isAlive = false; h.reviveAt = Date.now() + reviveMs; }
        }
      }
      this.save.expedition = null;
      this.save.combat = null;
    } else if (c.status === 'victory') {
      for (const p of c.participants) {
        if (p.type === 'hero' && p.heroId && p.isAlive) {
          const h = this.save.heroes.find((x) => x.id === p.heroId);
          if (!h || !h.isAlive) continue;
          h.xp += XP_PER_ROOM;
          const threshold = XP_TO_LEVEL(h.level);
          if (h.xp >= threshold) { h.xp -= threshold; h.level += 1; h.hp = heroStats(h).maxHp; }
        }
      }
      this.save.combat = null;
    }

    await this.persist();
    return { combat: result };
  }

  async reviveHero(heroId: string): Promise<{ resources: ResourceMap; heroes: HeroDTO[] }> {
    const h = this.save.heroes.find((x) => x.id === heroId);
    if (!h) throw new Error('Hero not found');
    if (h.isAlive) throw new Error('Hero is already alive');

    const now = Date.now();
    const timerExpired = h.reviveAt === undefined || now >= h.reviveAt;

    if (!timerExpired) {
      if ((this.save.resources.gold ?? 0) < REVIVE_GOLD_COST) {
        throw new Error(`Need ${REVIVE_GOLD_COST} gold to revive`);
      }
      this.save.resources.gold -= REVIVE_GOLD_COST;
    }

    h.isAlive = true;
    h.hp = heroStats(h).maxHp;
    h.reviveAt = undefined;

    await this.persist();
    const forge = this.bldLevel('forge');
    return { resources: { ...this.save.resources }, heroes: this.save.heroes.map((h) => heroToDTO(h, forge)) };
  }

  /** Persist current hero HP without triggering a full save cycle. Called before room transitions. */
  syncHeroHp(hp: number): void {
    const e = this.save.expedition;
    if (!e) return;
    const hero = this.save.heroes.find(h => h.id === e.heroId);
    if (hero) hero.hp = Math.max(0, hp);
  }

  /** Hero killed by a monster: mark dead, set revive timer, clear expedition. */
  async heroDefeated(): Promise<{ message: string; lootGained: Partial<ResourceMap> }> {
    const e = this.save.expedition;
    if (!e) return { message: 'Hero fell in battle.', lootGained: {} };
    const barracks = this.bldLevel('barracks');
    const reviveMs = REVIVE_TIME_MS * Math.max(0.2, 1 - (barracks - 1) * 0.2);
    const hero = this.save.heroes.find(h => h.id === e.heroId);
    if (hero) { hero.hp = 0; hero.isAlive = false; hero.reviveAt = Date.now() + reviveMs; }
    this.save.expedition = null;
    this.save.combat = null;
    await this.persist();
    return { message: 'Your hero fell in battle. All loot lost.', lootGained: {} };
  }

  async extract(): Promise<ExtractResult> {
    const e = this.save.expedition;
    if (!e || e.status !== 'active') throw new Error('Expedition already ended');

    const loot = { ...e.pendingLoot };
    const storage = this.bldLevel('storage');
    const cap = STORAGE_CAPS[Math.min(storage - 1, STORAGE_CAPS.length - 1)];
    for (const [k, v] of Object.entries(loot)) {
      const key = k as ResourceType;
      this.save.resources[key] = Math.min((this.save.resources[key] ?? 0) + (v ?? 0), cap);
    }

    // Completing the run grants the hero XP scaled by how deep they went.
    const hero = this.save.heroes.find((h) => h.id === e.heroId);
    if (hero && hero.isAlive) {
      const lab = this.bldLevel('laboratory');
      const xpGained = Math.round(XP_PER_ROOM * (e.depth + 1) * (1 + (lab - 1) * 0.2));
      hero.xp += xpGained;
      let threshold = XP_TO_LEVEL(hero.level);
      while (hero.xp >= threshold) {
        hero.xp -= threshold;
        hero.level += 1;
        hero.hp = heroStats(hero).maxHp;
        threshold = XP_TO_LEVEL(hero.level);
      }
    }

    this.save.expedition = null;
    await this.persist();

    return { success: true, lootGained: loot, message: 'Extraction successful! Loot secured.' };
  }
}

export const engine = new GameEngine();
