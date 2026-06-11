import type { CombatParticipant, Combat } from '@prisma/client';
import type { CombatActionType, CombatLogEntry } from '@labyrinth/shared';

export interface CombatWithParticipants extends Combat {
  participants: CombatParticipant[];
}

/**
 * Generates a simple PvE enemy for a combat encounter.
 */
export function generateEnemy(nodeIndex: number) {
  const tier = Math.floor(nodeIndex / 3) + 1;
  const enemyTypes = [
    { name: 'Labyrinth Rat', hp: 30, attack: 8, defense: 3, speed: 7 },
    { name: 'Stone Golem', hp: 80, attack: 12, defense: 15, speed: 3 },
    { name: 'Shadow Wraith', hp: 55, attack: 20, defense: 5, speed: 11 },
    { name: 'Minotaur Guard', hp: 100, attack: 18, defense: 12, speed: 6 },
  ];

  const base = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
  const multiplier = 1 + (tier - 1) * 0.2;

  return {
    type: 'enemy' as const,
    name: base.name,
    hp: Math.round(base.hp * multiplier),
    maxHp: Math.round(base.hp * multiplier),
    attack: Math.round(base.attack * multiplier),
    defense: Math.round(base.defense * multiplier),
    speed: base.speed,
    isAlive: true,
  };
}

/**
 * Processes a single combat action.
 * Returns updated participant states and new log entries.
 */
export function processCombatAction(
  combat: CombatWithParticipants,
  action: CombatActionType,
  targetId: string | undefined,
  actorId: string,
): { updatedParticipants: Partial<CombatParticipant>[]; newLog: CombatLogEntry[] } {
  const participants = combat.participants.map((p) => ({ ...p }));
  const actor = participants.find((p) => p.id === actorId);
  if (!actor || !actor.isAlive) {
    return { updatedParticipants: [], newLog: [] };
  }

  const newLog: CombatLogEntry[] = [];
  const updatedParticipants: Partial<CombatParticipant>[] = [];

  if (action === 'attack') {
    const target = targetId ? participants.find((p) => p.id === targetId) : getDefaultTarget(participants, actor);
    if (target && target.isAlive) {
      const rawDamage = Math.max(1, actor.attack - Math.floor(target.defense / 2));
      const damage = rawDamage + Math.floor(Math.random() * 5); // small variance
      const newHp = Math.max(0, target.hp - damage);
      const died = newHp <= 0;

      updatedParticipants.push({ id: target.id, hp: newHp, isAlive: !died });

      newLog.push({
        turn: combat.turn,
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
    // Hero ability — simplified: heroes always deal AOE or heal
    if (actor.type === 'hero') {
      const heroClass = getHeroClass(actor.name);
      handleHeroAbility(heroClass, actor, participants, newLog, combat.turn, updatedParticipants);
    }
  } else if (action === 'defend') {
    newLog.push({
      turn: combat.turn,
      actorId: actor.id,
      actorName: actor.name,
      action: 'defend',
      message: `${actor.name} takes a defensive stance.`,
    });
    // Defend gives a small HP buffer (simplified — no real buff system yet)
  }

  // Enemy AI: after player action, all living enemies take their turns
  const enemies = participants.filter((p) => p.type === 'enemy' && p.isAlive);
  for (const enemy of enemies) {
    // Skip enemies that were just killed
    const wasKilled = updatedParticipants.find((u) => u.id === enemy.id && !u.isAlive);
    if (wasKilled) continue;

    const heroTarget = participants.find(
      (p) => p.type === 'hero' && p.isAlive && !updatedParticipants.find((u) => u.id === p.id && !u.isAlive),
    );
    if (!heroTarget) continue;

    const rawDamage = Math.max(1, enemy.attack - Math.floor(heroTarget.defense / 2));
    const damage = rawDamage + Math.floor(Math.random() * 3);
    const newHp = Math.max(0, heroTarget.hp - damage);
    const died = newHp <= 0;

    const existing = updatedParticipants.find((u) => u.id === heroTarget.id);
    if (existing) {
      existing.hp = Math.max(0, (existing.hp ?? heroTarget.hp) - damage);
      existing.isAlive = (existing.hp ?? 0) > 0;
    } else {
      updatedParticipants.push({ id: heroTarget.id, hp: newHp, isAlive: !died });
    }

    newLog.push({
      turn: combat.turn,
      actorId: enemy.id,
      actorName: enemy.name,
      action: 'attack',
      targetId: heroTarget.id,
      targetName: heroTarget.name,
      damage,
      message: died
        ? `${enemy.name} strikes ${heroTarget.name} for ${damage}. ${heroTarget.name} falls!`
        : `${enemy.name} strikes ${heroTarget.name} for ${damage}. (${newHp}/${heroTarget.maxHp} HP remaining)`,
    });
  }

  return { updatedParticipants, newLog };
}

function getDefaultTarget(participants: CombatParticipant[], actor: CombatParticipant) {
  return participants.find((p) => p.type !== actor.type && p.isAlive) ?? null;
}

function getHeroClass(name: string): string {
  const map: Record<string, string> = {
    Aldric: 'guardian', Sylva: 'ranger', Morvyn: 'occultist', Eryn: 'medic',
  };
  return map[name] ?? 'guardian';
}

function handleHeroAbility(
  cls: string,
  actor: CombatParticipant,
  participants: CombatParticipant[],
  log: CombatLogEntry[],
  turn: number,
  updates: Partial<CombatParticipant>[],
) {
  if (cls === 'occultist') {
    // AOE: 30 damage to all enemies
    const enemies = participants.filter((p) => p.type === 'enemy' && p.isAlive);
    for (const e of enemies) {
      const newHp = Math.max(0, e.hp - 30);
      updates.push({ id: e.id, hp: newHp, isAlive: newHp > 0 });
    }
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', damage: 30, message: `${actor.name} unleashes Void Blast for 30 damage to all enemies!` });
  } else if (cls === 'medic') {
    // Heal lowest HP hero
    const lowestHero = participants.filter((p) => p.type === 'hero' && p.isAlive).sort((a, b) => a.hp - b.hp)[0];
    if (lowestHero) {
      const newHp = Math.min(lowestHero.maxHp, lowestHero.hp + 25);
      updates.push({ id: lowestHero.id, hp: newHp });
      log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', targetId: lowestHero.id, targetName: lowestHero.name, heal: 25, message: `${actor.name} casts Field Heal on ${lowestHero.name} for 25 HP.` });
    }
  } else if (cls === 'ranger') {
    // Double attack on one target
    const target = participants.find((p) => p.type === 'enemy' && p.isAlive);
    if (target) {
      const dmg = actor.attack * 2;
      const newHp = Math.max(0, target.hp - dmg);
      updates.push({ id: target.id, hp: newHp, isAlive: newHp > 0 });
      log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', targetId: target.id, targetName: target.name, damage: dmg, message: `${actor.name} fires Aimed Shot at ${target.name} for ${dmg} damage!` });
    }
  } else {
    // Guardian: defend (reduce next hit)
    log.push({ turn, actorId: actor.id, actorName: actor.name, action: 'ability', message: `${actor.name} raises Shield Wall!` });
  }
}

/**
 * Checks if combat is over and returns new status.
 */
export function evaluateCombatOutcome(
  participants: (CombatParticipant | Partial<CombatParticipant>)[],
  original: CombatParticipant[],
) {
  // Merge updates with originals
  const merged = original.map((p) => {
    const update = participants.find((u) => u.id === p.id);
    return update ? { ...p, ...update } : p;
  });

  const heroesAlive = merged.some((p) => p.type === 'hero' && p.isAlive);
  const enemiesAlive = merged.some((p) => p.type === 'enemy' && p.isAlive);

  if (!heroesAlive) return 'defeat';
  if (!enemiesAlive) return 'victory';
  return 'active';
}
