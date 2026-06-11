import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { processCombatAction, evaluateCombatOutcome } from '../game/combatEngine.js';
import type { Player } from '@prisma/client';
import type { CombatActionType, CombatLogEntry } from '@labyrinth/shared';

type AuthRequest = FastifyRequest & { player: Player };

function serializeCombat(combat: NonNullable<Awaited<ReturnType<typeof getCombat>>>) {
  return {
    id: combat.id,
    status: combat.status,
    turn: combat.turn,
    activeParticipantId: getNextActiveParticipant(combat.participants),
    participants: combat.participants.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      hp: p.hp,
      maxHp: p.maxHp,
      attack: p.attack,
      defense: p.defense,
      speed: p.speed,
      isAlive: p.isAlive,
      heroId: p.heroId,
    })),
    log: (combat.log ?? []) as CombatLogEntry[],
  };
}

function getNextActiveParticipant(participants: { id: string; isAlive: boolean; type: string }[]) {
  // In this simplified model, heroes always act first
  return participants.find((p) => p.isAlive && p.type === 'hero')?.id ?? '';
}

async function getCombat(combatId: string) {
  return prisma.combat.findUnique({
    where: { id: combatId },
    include: { participants: true, expedition: true },
  });
}

export async function combatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /combat/:id
  app.get<{ Params: { id: string } }>('/combat/:id', async (req, reply) => {
    const { player } = req as AuthRequest;
    const combat = await getCombat(req.params.id);
    if (!combat) return reply.status(404).send({ error: 'Combat not found' });
    if (combat.expedition.playerId !== player.id) return reply.status(403).send({ error: 'Forbidden' });
    return reply.send(serializeCombat(combat));
  });

  // POST /combat/action
  app.post<{
    Body: { combatId: string; action: CombatActionType; targetId?: string };
  }>('/combat/action', async (req, reply) => {
    const { player } = req as AuthRequest;
    const { combatId, action, targetId } = req.body;

    const combat = await getCombat(combatId);
    if (!combat) return reply.status(404).send({ error: 'Combat not found' });
    if (combat.expedition.playerId !== player.id) return reply.status(403).send({ error: 'Forbidden' });
    if (combat.status !== 'active') return reply.status(400).send({ error: 'Combat is not active' });

    // Find acting hero (first alive hero for simplicity)
    const actorId = getNextActiveParticipant(combat.participants);
    if (!actorId) return reply.status(400).send({ error: 'No active participant' });

    const { updatedParticipants, newLog } = processCombatAction(
      combat,
      action,
      targetId,
      actorId,
    );

    const currentLog = (combat.log ?? []) as CombatLogEntry[];
    const newStatus = evaluateCombatOutcome(updatedParticipants, combat.participants);

    // Persist updates in a transaction
    await prisma.$transaction([
      ...updatedParticipants.map((p) =>
        prisma.combatParticipant.update({
          where: { id: p.id! },
          data: {
            hp: p.hp,
            isAlive: p.isAlive,
          },
        }),
      ),
      prisma.combat.update({
        where: { id: combatId },
        data: {
          status: newStatus,
          turn: { increment: 1 },
          log: [...currentLog, ...newLog],
        },
      }),
    ]);

    // If heroes died, fail the expedition and lose loot
    if (newStatus === 'defeat') {
      await prisma.expedition.update({
        where: { id: combat.expeditionId },
        data: { status: 'failed', endedAt: new Date(), pendingLoot: {} },
      });

      // Mark heroes in this expedition as dead
      await prisma.hero.updateMany({
        where: {
          expeditionSlot: { expeditionId: combat.expeditionId },
        },
        data: { isAlive: false, hp: 0 },
      });
    }

    const updatedCombat = await getCombat(combatId);
    return reply.send({
      combat: serializeCombat(updatedCombat!),
      log: newLog,
    });
  });
}
