import type { ExpeditionNodeDTO, NodeType, ResourceMap } from '@labyrinth/shared';

/**
 * Generates a fixed 8-node Y-shaped labyrinth matching the isometric scene layout.
 *
 * Topology:
 *   node_0 (start) → node_1 → node_2 (combat) → node_3 (junction)
 *   node_3 → node_4 → node_6 (exit_left)
 *   node_3 → node_5 → node_7 (exit_right)
 *
 * x/y are tile coordinates used by the isometric scene zone definitions.
 */
export function generateLabyrinth(mapRoomLevel = 1): ExpeditionNodeDTO[] {
  const lootChance = Math.min(0.5, 0.3 + (mapRoomLevel - 1) * 0.05);

  function roll(): NodeType {
    const r = Math.random();
    if (r < lootChance) return 'loot';
    if (r < lootChance + 0.40) return 'pve_combat';
    return 'empty';
  }

  const nodes: ExpeditionNodeDTO[] = [
    mk('node_0', 'start',      5, 12, true), // spawn
    mk('node_1', roll(),       5,  8),       // first room (loot / combat / empty)
    mk('node_2', 'pve_combat', 5,  6),       // main combat (always)
    mk('node_3', 'empty',      5,  3),       // junction crossroads
    mk('node_4', roll(),       3,  1),       // left branch
    mk('node_5', roll(),       7,  1),       // right branch
    mk('node_6', 'exit',       3,  0),       // exit left
    mk('node_7', 'exit',       7,  0),       // exit right
  ];

  for (const n of nodes) {
    if (n.type === 'loot') n.loot = generateLoot();
  }

  connect(nodes[0], nodes[1]);
  connect(nodes[1], nodes[2]);
  connect(nodes[2], nodes[3]);
  connect(nodes[3], nodes[4]);
  connect(nodes[3], nodes[5]);
  connect(nodes[4], nodes[6]);
  connect(nodes[5], nodes[7]);

  return nodes;
}

function mk(id: string, type: NodeType, x: number, y: number, visited = false): ExpeditionNodeDTO {
  return { id, type, visited, connections: [], x, y, loot: undefined };
}

function connect(a: ExpeditionNodeDTO, b: ExpeditionNodeDTO) {
  if (!a.connections.includes(b.id)) a.connections.push(b.id);
  if (!b.connections.includes(a.id)) b.connections.push(a.id);
}

function generateLoot(): Partial<ResourceMap> {
  return {
    gold: roll2(10, 50),
    stone: Math.random() > 0.5 ? roll2(5, 20) : 0,
    iron: Math.random() > 0.7 ? roll2(5, 15) : 0,
    essence: Math.random() > 0.85 ? roll2(1, 5) : 0,
    relics: Math.random() > 0.95 ? 1 : 0,
  };
}

function roll2(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
