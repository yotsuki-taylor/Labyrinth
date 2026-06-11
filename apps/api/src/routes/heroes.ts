import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import type { Player } from '@prisma/client';

type AuthRequest = FastifyRequest & { player: Player };

export async function heroRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /heroes — returns all heroes for the current player
  app.get('/heroes', async (req, reply) => {
    const { player } = req as AuthRequest;

    const heroes = await prisma.hero.findMany({
      where: { playerId: player.id },
      include: { template: true },
    });

    return reply.send(
      heroes.map((h) => ({
        id: h.id,
        name: h.name,
        class: h.template.class,
        label: h.template.label,
        level: h.level,
        xp: h.xp,
        isAlive: h.isAlive,
        stats: {
          hp: h.hp,
          maxHp: h.template.baseHp + (h.level - 1) * 10,
          attack: h.template.baseAttack + (h.level - 1) * 2,
          defense: h.template.baseDefense + (h.level - 1) * 1,
          speed: h.template.baseSpeed,
        },
      })),
    );
  });
}
