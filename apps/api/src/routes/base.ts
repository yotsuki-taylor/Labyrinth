import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { BUILDING_CONFIGS, canAfford } from '@labyrinth/shared';
import type { Player } from '@prisma/client';
import type { BuildingType } from '@labyrinth/shared';

type AuthRequest = FastifyRequest & { player: Player };

export async function baseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /base — returns base with all buildings
  app.get('/base', async (req, reply) => {
    const { player } = req as AuthRequest;

    const base = await prisma.base.findUnique({
      where: { playerId: player.id },
      include: { buildings: true },
    });

    if (!base) return reply.status(404).send({ error: 'Base not found' });

    return reply.send({
      id: base.id,
      level: base.level,
      buildings: base.buildings.map((b) => ({
        id: b.id,
        type: b.type,
        level: b.level,
      })),
    });
  });

  // POST /base/upgrade — upgrades a specific building
  app.post<{ Body: { buildingType: string } }>(
    '/base/upgrade',
    async (req, reply) => {
      const { player } = req as AuthRequest;
      const { buildingType } = req.body;

      if (!buildingType) {
        return reply.status(400).send({ error: 'buildingType is required' });
      }

      const config = BUILDING_CONFIGS[buildingType as BuildingType];
      if (!config) {
        return reply.status(400).send({ error: `Unknown building type: ${buildingType}` });
      }

      const [base, balance] = await Promise.all([
        prisma.base.findUnique({ where: { playerId: player.id }, include: { buildings: true } }),
        prisma.resourceBalance.findUnique({ where: { playerId: player.id } }),
      ]);

      if (!base || !balance) return reply.status(404).send({ error: 'Base or resources not found' });

      const building = base.buildings.find((b) => b.type === buildingType);
      if (!building) return reply.status(404).send({ error: 'Building not found' });

      if (building.level >= config.maxLevel) {
        return reply.status(400).send({ error: 'Building already at max level' });
      }

      const cost = config.upgradeCost(building.level);
      const currentResources = {
        gold: balance.gold,
        stone: balance.stone,
        iron: balance.iron,
        essence: balance.essence,
        relics: balance.relics,
      };

      if (!canAfford(currentResources, cost)) {
        return reply.status(400).send({ error: 'Insufficient resources', required: cost, current: currentResources });
      }

      // Deduct resources and upgrade building in a transaction
      const [updatedBuilding, updatedBalance] = await prisma.$transaction([
        prisma.building.update({
          where: { id: building.id },
          data: { level: { increment: 1 } },
        }),
        prisma.resourceBalance.update({
          where: { playerId: player.id },
          data: {
            gold: { decrement: cost.gold ?? 0 },
            stone: { decrement: cost.stone ?? 0 },
            iron: { decrement: cost.iron ?? 0 },
            essence: { decrement: cost.essence ?? 0 },
            relics: { decrement: cost.relics ?? 0 },
          },
        }),
      ]);

      return reply.send({
        building: { id: updatedBuilding.id, type: updatedBuilding.type, level: updatedBuilding.level },
        resources: {
          gold: updatedBalance.gold,
          stone: updatedBalance.stone,
          iron: updatedBalance.iron,
          essence: updatedBalance.essence,
          relics: updatedBalance.relics,
        },
        message: `${config.label} upgraded to level ${updatedBuilding.level}`,
      });
    },
  );
}
