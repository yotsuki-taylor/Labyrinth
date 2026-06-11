import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import type { Player } from '@prisma/client';

type AuthRequest = FastifyRequest & { player: Player };

export async function playerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /player/me — returns full player state
  app.get('/player/me', async (req, reply) => {
    const { player } = req as AuthRequest;

    const [fullPlayer, resources, heroes] = await Promise.all([
      prisma.player.findUnique({ where: { id: player.id } }),
      prisma.resourceBalance.findUnique({ where: { playerId: player.id } }),
      prisma.hero.findMany({
        where: { playerId: player.id },
        include: { template: true },
      }),
    ]);

    return reply.send({
      player: {
        id: fullPlayer!.id,
        telegramId: fullPlayer!.telegramId,
        username: fullPlayer!.username,
        createdAt: fullPlayer!.createdAt,
      },
      resources: {
        gold: resources?.gold ?? 0,
        stone: resources?.stone ?? 0,
        iron: resources?.iron ?? 0,
        essence: resources?.essence ?? 0,
        relics: resources?.relics ?? 0,
      },
      heroes: heroes.map((h) => ({
        id: h.id,
        name: h.name,
        class: h.template.class,
        level: h.level,
        xp: h.xp,
        stats: {
          hp: h.hp,
          maxHp: h.template.baseHp + (h.level - 1) * 10,
          attack: h.template.baseAttack + (h.level - 1) * 2,
          defense: h.template.baseDefense + (h.level - 1) * 1,
          speed: h.template.baseSpeed,
        },
        isAlive: h.isAlive,
      })),
    });
  });
}
