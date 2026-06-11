import type { NodeType } from '@labyrinth/shared';

export interface GeneratedNode {
  id: string;
  type: NodeType;
  connections: string[];
  posX: number;
  posY: number;
  lootConfig?: { gold?: number; stone?: number; iron?: number; essence?: number; relics?: number };
}

/**
 * Generates a simple graph-based labyrinth with 10–15 nodes.
 * Layout: start → branching paths → exit.
 */
export function generateLabyrinth(mapRoomLevel = 1): GeneratedNode[] {
  const nodeCount = 10 + Math.min(mapRoomLevel - 1, 5); // 10–15 nodes
  const nodes: GeneratedNode[] = [];

  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    const id = `node_${i}`;
    let type: NodeType;

    if (i === 0) {
      type = 'start';
    } else if (i === nodeCount - 1) {
      type = 'exit';
    } else {
      const roll = Math.random();
      if (roll < 0.25) type = 'loot';
      else if (roll < 0.55) type = 'pve_combat';
      else type = 'empty';
    }

    nodes.push({
      id,
      type,
      connections: [],
      posX: Math.round(Math.random() * 600 + 50),
      posY: Math.round(Math.random() * 400 + 50),
      lootConfig: type === 'loot' ? generateLoot() : undefined,
    });
  }

  // Connect nodes into a graph (ensure start→exit path exists)
  // First, create a main chain
  for (let i = 0; i < nodeCount - 1; i++) {
    connect(nodes[i], nodes[i + 1]);
  }

  // Add a few extra connections for branching
  const extraEdges = Math.floor(nodeCount * 0.3);
  for (let k = 0; k < extraEdges; k++) {
    const a = Math.floor(Math.random() * (nodeCount - 2));
    const b = a + 2 + Math.floor(Math.random() * 3);
    if (b < nodeCount) {
      connect(nodes[a], nodes[b]);
    }
  }

  return nodes;
}

function connect(a: GeneratedNode, b: GeneratedNode) {
  if (!a.connections.includes(b.id)) a.connections.push(b.id);
  if (!b.connections.includes(a.id)) b.connections.push(a.id);
}

function generateLoot() {
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
