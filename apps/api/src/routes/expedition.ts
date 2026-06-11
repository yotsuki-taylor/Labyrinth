import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { generateLabyrinth } from '../game/labyrinthGenerator.js';
import { generateEnemy } from '../game/combatEngine.js';
import type { Player } from '@prisma/client';
import type { ResourceMap } from '@labyrinth/shared';

type AuthRequest = FastifyRequest & { player: Player };

function serializeExpedition(expedition: Awaited<ReturnType<typeof getExpedition>>) {
  if (!expedition) return null;
  const pendingLoot = (expedition.pendingLoot ?? {}) as Partial<ResourceMap>;
  return {
    id: expedition.id,
    status: expedition.status,
    currentNodeId: expedition.currentNodeId,
    startedAt: expedition.startedAt,
    heroIds: expedition.heroes.map((eh) => eh.heroId),
    nodes: expedition.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      visited: n.visited,
      connections: n.connections as string[],
      x: n.posX,
      y: n.posY,
      loot: n.lootConfig as Partial<ResourceMap> | undefined,
    })),
    pendingLoot,
  };
}

async function getExpedition(expeditionId: string) {
  return prisma.expedition.findUnique({
    where: { id: expeditionId },
    include: { nodes: true, heroes: true },
  });
}

export async function expeditionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // POST /expedition/start
  app.post<{ Body: { heroIds: string[] } }>('/expedition/start', async (req, reply) => {
    const { player } = req as AuthRequest;
    const { heroIds } = req.body;

    if (!heroIds || heroIds.length === 0) {
      return reply.status(400).send({ error: 'Select at least one hero' });
    }

    // Check if there's already an active expedition
    const active = await prisma.expedition.findFirst({
      where: { playerId: player.id, status: 'active' },
    });
    if (active) {
      return reply.status(400).send({ error: 'An expedition is already in progress', expeditionId: active.id });
    }

    // Validate heroes belong to player and are alive
    const heroes = await prisma.hero.findMany({
      where: { id: { in: heroIds }, playerId: player.id, isAlive: true },
    });
    if (heroes.length !== heroIds.length) {
      return reply.status(400).send({ error: 'Invalid or dead heroes selected' });
    }

    // Get map room level for labyrinth size
    const mapRoom = await prisma.building.findFirst({
      where: { base: { playerId: player.id }, type: 'map_room' },
    });

    const mapNodes = generateLabyrinth(mapRoom?.level ?? 1);
    const startNode = mapNodes[0];

    // Create expedition
    const expedition = await prisma.expedition.create({
      data: {
        playerId: player.id,
        currentNodeId: startNode.id,
        pendingLoot: {},
        nodes: {
          createMany: {
            data: mapNodes.map((n) => ({
              id: n.id,
              type: n.type,
              connections: n.connections,
              posX: n.posX,
              posY: n.posY,
              lootConfig: n.lootConfig ?? null,
              visited: n.type === 'start',
            })),
          },
        },
        heroes: {
          createMany: {
            data: heroes.map((h) => ({ heroId: h.id })),
          },
        },
      },
      include: { nodes: true, heroes: true },
    });

    return reply.send(serializeExpedition(expedition));
  });

  // GET /expedition/current
  app.get('/expedition/current', async (req, reply) => {
    const { player } = req as AuthRequest;

    const expedition = await prisma.expedition.findFirst({
      where: { playerId: player.id, status: 'active' },
      include: { nodes: true, heroes: true },
      orderBy: { startedAt: 'desc' },
    });

    if (!expedition) return reply.status(404).send({ error: 'No active expedition' });
    return reply.send(serializeExpedition(expedition));
  });

  // POST /expedition/move
  app.post<{ Body: { expeditionId: string; targetNodeId: string } }>(
    '/expedition/move',
    async (req, reply) => {
      const { player } = req as AuthRequest;
      const { expeditionId, targetNodeId } = req.body;

      const expedition = await getExpedition(expeditionId);
      if (!expedition || expedition.playerId !== player.id) {
        return reply.status(404).send({ error: 'Expedition not found' });
      }
      if (expedition.status !== 'active') {
        return reply.status(400).send({ error: 'Expedition is not active' });
      }

      const currentNode = expedition.nodes.find((n) => n.id === expedition.currentNodeId);
      if (!currentNode) return reply.status(400).send({ error: 'Current node not found' });

      const connections = currentNode.connections as string[];
      if (!connections.includes(targetNodeId)) {
        return reply.status(400).send({ error: 'Target node is not connected to current node' });
      }

      const targetNode = expedition.nodes.find((n) => n.id === targetNodeId);
      if (!targetNode) return reply.status(400).send({ error: 'Target node not found' });

      // Mark node as visited and update position
      await prisma.expeditionNode.update({
        where: { id: targetNodeId },
        data: { visited: true },
      });
      await prisma.expedition.update({
        where: { id: expeditionId },
        data: { currentNodeId: targetNodeId },
      });

      let event: string = 'moved';
      let combatId: string | undefined;
      let loot: Partial<ResourceMap> | undefined;

      if (targetNode.type === 'loot' && !targetNode.visited) {
        // Pick up loot
        loot = (targetNode.lootConfig ?? {}) as Partial<ResourceMap>;
        const currentLoot = (expedition.pendingLoot ?? {}) as Partial<ResourceMap>;
        const newLoot: Partial<ResourceMap> = { ...currentLoot };
        for (const [k, v] of Object.entries(loot)) {
          newLoot[k as keyof ResourceMap] = ((newLoot[k as keyof ResourceMap] ?? 0) as number) + (v as number);
        }
        await prisma.expedition.update({ where: { id: expeditionId }, data: { pendingLoot: newLoot } });
        event = 'loot_found';
      } else if (targetNode.type === 'pve_combat' && !targetNode.visited) {
        // Start combat
        const heroParticipants = await prisma.hero.findMany({
          where: { id: { in: expedition.heroes.map((eh) => eh.heroId) } },
          include: { template: true },
        });

        const nodeIndex = expedition.nodes.indexOf(targetNode);
        const enemy = generateEnemy(nodeIndex);

        const combat = await prisma.combat.create({
          data: {
            expeditionId,
            nodeId: targetNodeId,
            participants: {
              createMany: {
                data: [
                  ...heroParticipants.map((h) => ({
                    type: 'hero',
                    name: h.name,
                    hp: h.hp,
                    maxHp: h.template.baseHp + (h.level - 1) * 10,
                    attack: h.template.baseAttack + (h.level - 1) * 2,
                    defense: h.template.baseDefense + (h.level - 1),
                    speed: h.template.baseSpeed,
                    heroId: h.id,
                    isAlive: true,
                  })),
                  { type: 'enemy', ...enemy, heroId: null },
                ],
              },
            },
          },
        });

        combatId = combat.id;
        event = 'combat_started';
      } else if (targetNode.type === 'exit') {
        event = 'exited';
      }

      const updated = await getExpedition(expeditionId);
      return reply.send({ expedition: serializeExpedition(updated), event, combatId, loot });
    },
  );

  // POST /expedition/extract — convert pending loot to permanent resources
  app.post<{ Body: { expeditionId: string } }>('/expedition/extract', async (req, reply) => {
    const { player } = req as AuthRequest;
    const { expeditionId } = req.body;

    const expedition = await getExpedition(expeditionId);
    if (!expedition || expedition.playerId !== player.id) {
      return reply.status(404).send({ error: 'Expedition not found' });
    }
    if (expedition.status !== 'active') {
      return reply.status(400).send({ error: 'Expedition already ended' });
    }

    // Must be on exit node
    const currentNode = expedition.nodes.find((n) => n.id === expedition.currentNodeId);
    if (currentNode?.type !== 'exit') {
      return reply.status(400).send({ error: 'Must be on an exit node to extract' });
    }

    const loot = (expedition.pendingLoot ?? {}) as Partial<ResourceMap>;

    await prisma.$transaction([
      prisma.resourceBalance.update({
        where: { playerId: player.id },
        data: {
          gold: { increment: loot.gold ?? 0 },
          stone: { increment: loot.stone ?? 0 },
          iron: { increment: loot.iron ?? 0 },
          essence: { increment: loot.essence ?? 0 },
          relics: { increment: loot.relics ?? 0 },
        },
      }),
      prisma.expedition.update({
        where: { id: expeditionId },
        data: { status: 'completed', endedAt: new Date(), pendingLoot: {} },
      }),
    ]);

    return reply.send({
      success: true,
      lootGained: loot,
      message: 'Extraction successful! Loot secured.',
    });
  });
}
