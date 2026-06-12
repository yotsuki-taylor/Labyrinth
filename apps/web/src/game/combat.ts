import type { CombatParticipantDTO, CombatActionType, CombatLogEntry, CombatStatus } from '@labyrinth/shared';

/**
 * Browser port of the former server-side combat engine.
 * Operates purely on CombatParticipantDTO objects (no Prisma).
 */

export interface EnemyTemplate {
  type: 'enemy';
  name: string;
  image: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  isAlive: true;
}

const ENEMY_TYPES = [
  { name: 'Skeleton Warrior', image: 'enemies/skeleton_warrior.png', hp: 90, attack: 14, defense: 16, speed: 4 },
  { name: 'Skeleton Archer',  image: 'enemies/skeleton_archer.png',  hp: 60, attack: 18, defense: 6,  speed: 11 },
  { name: 'Skeleton Mage',    image: 'enemies/skeleton_mage.png',    hp: 45, attack: 24, defense: 3,  speed: 9  },
];

export function generateEnemy(nodeIndex: number): EnemyTemplate {
  const tier = Math.floor(nodeIndex / 3) + 1;
  const base = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
  const m = 1 + (tier - 1) * 0.2;
  return {
    type: 'enemy',
    name: base.name,
    image: base.image,
    hp: Math.round(base.hp * m),
    maxHp: Math.round(base.hp * m),
    attack: Math.round(base.attack * m),
    defense: Math.round(base.defense * m),
    speed: base.speed,
    isAlive: true,
  };
}

export function generateEnemyGroup(nodeIndex: number): EnemyTemplate[] {
  const tier = Math.floor(nodeIndex / 3) + 1;
  const count =
    tier === 1 ? 1 :
    tier === 2 ? (Math.random() < 0.5 ? 1 : 2) :
    tier === 3 ? 2 :
    (Math.random() < 0.4 ? 2 : 3);

  const group = Array.from({ length: count }, () => generateEnemy(nodeIndex));

  // Add numeric suffix when multiple enemies share the same type
  const seen: Record<string, number> = {};
  for (const e of group) seen[e.name] = (seen[e.name] ?? 0) + 1;
  const used: Record<string, number> = {};
  for (const e of group) {
    if (seen[e.name] > 1) {
      used[e.name] = (used[e.name] ?? 0) + 1;
      e.name = `${e.name} ${used[e.name]}`;
    }
  }
  return group;
}

type Update = Partial<CombatParticipantDTO> & { id: string };

/**
 * Processes a single combat action (player action followed by enemy AI turns).
 * Returns participant updates and new log entries; the caller merges them.
 */
export function processCombatAction(
  participants: CombatParticipantDTO[],
  turn: number,
  action: CombatActionType,
  targetId: string | undefined,
  actorId: string,
): { updatedParticipants: Update[]; newLog: CombatLogEntry[] } {
  const actor = participants.find((p) => p.id === actorId);
  if (!actor || !actor.isAlive) {
    return { updatedParticipants: [], newLog: [] };
  }

  const newLog: CombatLogEntry[] = [];
  const updatedParticipants: Update[] = [];

  if (action === 'attack') {
    const target = targetId
      ? participants.find((p) => p.id === targetId)
      : getDefaultTarget(participants, actor);
    if (target && target.isAlive) {
      const rawDamage = Math.max(1, actor.attack - Math.floor(target.defense / 2));
      const damage = rawDamage + Math.floor(Math.random() * 5);
      const newHp = Math.max(0, target.hp - damage);
      const died = newHp <= 0;

      updatedParticipants.push({ id: target.id, hp: newHp, isAlive: !died });
      newLog.push({
        turn,
        actorId: actor.id,
        actorName: actor.name,
        action: 'attack',
        targetId: target.id,
        targetName: target.name,
        damage,
        message: died
          ? `${actor.name} attacks ${target.name} for ${damage} damage. ${target.name} is defeated!`
          : `${actor.name} attacks ${target.name} for ${damage} damage. (${newHp}/${target.maxHp} HP remaining)`,
      });
    }
  } else if (action === 'ability') {
    if (actor.type === 'hero') {
      handleHeroAbility(actor.heroClass ?? getHeroClass(actor.name), actor, participants, newLog, turn, updatedParticipants);
    }
  } else if (action === 'defend') {
    newLog.push({
      turn,
      actorId: actor.id,
      actorName: actor.name,
      action: 'defend',
      message: `${actor.name} takes a defensive stance.`,
    });
  }

  return { updatedParticipants, newLog };
}

function getDefaultTarget(participants: CombatParticipantDTO[], actor: CombatParticipantDTO) {
  return participants.find((p) => p.type !== actor.type && p.isAlive) ?? undefined;
}

function getHeroClass(name: string): string {
  const map: Record<string, string> = {
    Aldric: 'warrior', Sylva: 'ranger', Morvyn: 'warlock', Eryn: 'cleric',
    Zara: 'assassin', Ignis: 'sorcerer', Theron: 'paladin', Grak: 'barbarian',
    Willow: 'druid', Lyric: 'bard', Vesper: 'alchemist', Cog: 'inventor',
  };
  return map[name] ?? 'warrior';
}

function handleHeroAbility(
  cls: string,
  actor: CombatParticipantDTO,
  participants: CombatParticipantDTO[],
  log: CombatLogEntry[],
  turn: number,
  updates: Update[],
) {
  const enemies = participants.filter((p) => p.type === 'enemy' && p.isAlive);
  const heroes = participants.filter((p) => p.type === 'hero' && p.isAlive);

  if (cls === 'warlock') {
    for (const e of enemies) {
      const newHp = Math.max(0, e.hp - 30);
      updates.push({ id: e.id, hp: newHp, isAlive: newHp > 0 });
    }
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', damage: 30, message: `${actor.name} unleashes Void Blast for 30 damage to all enemies!` });

  } else if (cls === 'cleric' || cls === 'paladin') {
    const healAmt = cls === 'cleric' ? 25 : 20;
    const target = heroes.sort((a, b) => a.hp - b.hp)[0];
    if (target) {
      const newHp = Math.min(target.maxHp, target.hp + healAmt);
      updates.push({ id: target.id, hp: newHp });
      log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', targetId: target.id, targetName: target.name, heal: healAmt, message: `${actor.name} heals ${target.name} for ${healAmt} HP.` });
    }

  } else if (cls === 'ranger') {
    const target = enemies[0];
    if (target) {
      const dmg = actor.attack * 2;
      const newHp = Math.max(0, target.hp - dmg);
      updates.push({ id: target.id, hp: newHp, isAlive: newHp > 0 });
      log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', targetId: target.id, targetName: target.name, damage: dmg, message: `${actor.name} fires Aimed Shot at ${target.name} for ${dmg} damage!` });
    }

  } else if (cls === 'assassin') {
    const target = enemies[0];
    if (target) {
      const dmg = actor.attack * 3;
      const newHp = Math.max(0, target.hp - dmg);
      updates.push({ id: target.id, hp: newHp, isAlive: newHp > 0 });
      log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', targetId: target.id, targetName: target.name, damage: dmg, message: `${actor.name} backstabs ${target.name} for ${dmg} damage!` });
    }

  } else if (cls === 'barbarian') {
    const target = enemies[0];
    if (target) {
      const dmg = actor.attack * 2;
      const newHp = Math.max(0, target.hp - dmg);
      updates.push({ id: target.id, hp: newHp, isAlive: newHp > 0 });
      log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', targetId: target.id, targetName: target.name, damage: dmg, message: `${actor.name} unleashes Berserker Slash on ${target.name} for ${dmg} damage!` });
    }

  } else if (cls === 'sorcerer') {
    const dmg = 25;
    for (const e of enemies) {
      const newHp = Math.max(0, e.hp - dmg);
      updates.push({ id: e.id, hp: newHp, isAlive: newHp > 0 });
    }
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', damage: dmg, message: `${actor.name} casts Arcane Nova for ${dmg} fixed damage to all enemies!` });

  } else if (cls === 'druid') {
    const dmg = 20;
    for (const e of enemies) {
      const newHp = Math.max(0, e.hp - dmg);
      updates.push({ id: e.id, hp: newHp, isAlive: newHp > 0 });
    }
    const selfHeal = Math.min(actor.maxHp, actor.hp + 15);
    updates.push({ id: actor.id, hp: selfHeal });
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', damage: dmg, heal: 15, message: `${actor.name} calls Nature's Wrath — ${dmg} dmg to all enemies and heals self 15 HP!` });

  } else if (cls === 'bard') {
    const healAmt = 10;
    for (const h of heroes) {
      const existing = updates.find(u => u.id === h.id);
      const currentHp = existing?.hp ?? h.hp;
      const newHp = Math.min(h.maxHp, currentHp + healAmt);
      if (existing) existing.hp = newHp;
      else updates.push({ id: h.id, hp: newHp });
    }
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', heal: healAmt, message: `${actor.name} plays Battle Hymn, restoring ${healAmt} HP to all heroes!` });

  } else if (cls === 'alchemist') {
    const target = enemies[0];
    if (target) {
      const dmg = 40;
      const newHp = Math.max(0, target.hp - dmg);
      updates.push({ id: target.id, hp: newHp, isAlive: newHp > 0 });
      log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', targetId: target.id, targetName: target.name, damage: dmg, message: `${actor.name} hurls Explosive Vial at ${target.name} for ${dmg} fixed damage!` });
    }

  } else if (cls === 'inventor') {
    const dmg = 15;
    for (const e of enemies) {
      const newHp = Math.max(0, e.hp - dmg);
      updates.push({ id: e.id, hp: newHp, isAlive: newHp > 0 });
    }
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', damage: dmg, message: `${actor.name} deploys Mechanical Swarm for ${dmg} damage to all enemies!` });

  } else {
    // warrior: Shield Wall
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', message: `${actor.name} raises Shield Wall!` });
  }
}

/** Applies updates onto participants in place and returns the resulting status. */
export function applyUpdates(participants: CombatParticipantDTO[], updates: Update[]): void {
  for (const u of updates) {
    const p = participants.find((x) => x.id === u.id);
    if (!p) continue;
    if (u.hp !== undefined) p.hp = u.hp;
    if (u.isAlive !== undefined) p.isAlive = u.isAlive;
  }
}

export function evaluateOutcome(participants: CombatParticipantDTO[]): CombatStatus {
  const heroesAlive = participants.some((p) => p.type === 'hero' && p.isAlive);
  const enemiesAlive = participants.some((p) => p.type === 'enemy' && p.isAlive);
  if (!heroesAlive) return 'defeat';
  if (!enemiesAlive) return 'victory';
  return 'active';
}

