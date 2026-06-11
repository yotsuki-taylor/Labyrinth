import type { ExpeditionNodeDTO, NodeType, ResourceMap } from '@labyrinth/shared';

/**
 * Browser port of the former server-side labyrinth generator.
 * Produces a graph of 10–15 nodes: start → branching paths → exit.
 */
export function generateLabyrinth(mapRoomLevel = 1): ExpeditionNodeDTO[] {
  const nodeCount = 10 + Math.min(mapRoomLevel - 1, 5); // 10–15 nodes
  const nodes: ExpeditionNodeDTO[] = [];

  // Map Room increases loot node density: +4% per level above 1.
  const lootChance = Math.min(0.45, 0.25 + (mapRoomLevel - 1) * 0.04);

  for (let i = 0; i < nodeCount; i++) {
    let type: NodeType;
    if (i === 0) {
      type = 'start';
    } else if (i === nodeCount - 1) {
      type = 'exit';
    } else {
      const roll = Math.random();
      if (roll < lootChance) type = 'loot';
      else if (roll < lootChance + 0.30) type = 'pve_combat';
      else type = 'empty';
    }

    nodes.push({
      id: `node_${i}`,
      type,
      // The start node counts as already visited (you spawn there).
      visited: type === 'start',
      connections: [],
      x: Math.round(Math.random() * 600 + 50),
      y: Math.round(Math.random() * 400 + 50),
      loot: type === 'loot' ? generateLoot() : undefined,
    });
  }

  // Main chain guarantees a start→exit path exists.
  for (let i = 0; i < nodeCount - 1; i++) {
    connect(nodes[i], nodes[i + 1]);
  }

  // A few extra edges for branching.
  const extraEdges = Math.floor(nodeCount * 0.3);
  for (let k = 0; k < extraEdges; k++) {
    const a = Math.floor(Math.random() * (nodeCount - 2));
    const b = a + 2 + Math.floor(Math.random() * 3);
    if (b < nodeCount) connect(nodes[a], nodes[b]);
  }

  return nodes;
}

function connect(a: ExpeditionNodeDTO, b: ExpeditionNodeDTO) {
  if (!a.connections.includes(b.id)) a.connections.push(b.id);
  if (!b.connections.includes(a.id)) b.connections.push(a.id);
}

function generateLoot(): Partial<ResourceMap> {
  return {
    gold: roll(10, 50),
    stone: Math.random() > 0.5 ? roll(5, 20) : 0,
    iron: Math.random() > 0.7 ? roll(5, 15) : 0,
    essence: Math.random() > 0.85 ? roll(1, 5) : 0,
    relics: Math.random() > 0.95 ? 1 : 0,
  };
}

function roll(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
