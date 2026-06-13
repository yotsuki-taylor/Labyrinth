import type {
  ExpeditionRoomDTO,
  RoomType,
  RoomPickupDTO,
  RoomExitDTO,
  ResourceType,
} from '@labyrinth/shared';

/**
 * Procedurally generates a single isometric room the player walks through.
 * Resources are scattered across the floor; two exits lead onward (or extract).
 */

function newId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

function ri(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Picks the type of a room reached by going one level deeper. */
function rollRoomType(): RoomType {
  const r = Math.random();
  if (r < 0.45) return 'loot';
  if (r < 0.60) return 'treasure';
  return 'empty';
}

/** How many resource piles & their richness, by room type and depth. */
function pickupPlan(type: RoomType, depth: number): { count: number; rare: boolean } {
  const depthBonus = Math.floor(depth / 2);
  switch (type) {
    case 'start':    return { count: ri(1, 2), rare: false };
    case 'empty':    return { count: ri(1, 3) + depthBonus, rare: false };
    case 'loot':     return { count: ri(4, 6) + depthBonus, rare: false };
    case 'treasure': return { count: ri(3, 5) + depthBonus, rare: true };
  }
}

function rollResource(rare: boolean): { resource: ResourceType; amount: number } {
  if (rare) {
    const r = Math.random();
    if (r < 0.45) return { resource: 'essence', amount: ri(2, 6) };
    if (r < 0.70) return { resource: 'relics', amount: ri(1, 2) };
    if (r < 0.88) return { resource: 'iron', amount: ri(10, 25) };
    return { resource: 'gold', amount: ri(40, 90) };
  }
  const r = Math.random();
  if (r < 0.50) return { resource: 'gold', amount: ri(8, 30) };
  if (r < 0.78) return { resource: 'stone', amount: ri(5, 20) };
  if (r < 0.93) return { resource: 'iron', amount: ri(3, 12) };
  if (r < 0.99) return { resource: 'essence', amount: ri(1, 3) };
  return { resource: 'relics', amount: 1 };
}

/**
 * Generates one room.
 * @param depth     0-based room depth in the run.
 * @param maxDepth  total rooms in the run (final room is depth === maxDepth - 1).
 * @param type      the room's type.
 */
export function generateRoom(depth: number, maxDepth: number, type: RoomType): ExpeditionRoomDTO {
  const width = ri(8, 11);
  const height = ri(9, 12);
  const isFinal = depth >= maxDepth - 1;

  // Scatter pickups across the interior (leave a 1-tile margin from walls,
  // and keep the bottom entrance row / top exit row clear).
  const { count, rare } = pickupPlan(type, depth);
  const pickups: RoomPickupDTO[] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (pickups.length < count && attempts < count * 8) {
    attempts++;
    const x = ri(1, width - 2);
    const y = ri(2, height - 3);
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);
    const { resource, amount } = rollResource(rare && Math.random() < 0.6);
    pickups.push({ id: newId('pk'), resource, amount, x, y, collected: false });
  }

  // Two exits at the top — left and right doorways.
  const exits: RoomExitDTO[] = [
    { id: newId('ex'), side: 'left',  leadsTo: isFinal ? type : rollRoomType(), isExtract: isFinal },
    { id: newId('ex'), side: 'right', leadsTo: isFinal ? type : rollRoomType(), isExtract: isFinal },
  ];

  return { id: newId('room'), depth, type, width, height, pickups, exits, isFinal };
}

/** Creates the opening room of a fresh expedition. */
export function generateStartRoom(maxDepth: number): ExpeditionRoomDTO {
  return generateRoom(0, maxDepth, 'start');
}

/** Run length scales with Map Room level: 4 rooms at L1, +1 per level (cap 8). */
export function runDepth(mapRoomLevel: number): number {
  return Math.min(8, 4 + (mapRoomLevel - 1));
}
