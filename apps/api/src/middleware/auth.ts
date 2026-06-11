import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { HERO_TEMPLATES } from '@labyrinth/shared';
import type { HeroClass } from '@labyrinth/shared';

/**
 * Parses Telegram initData or falls back to DEV_MODE mock.
 * Attaches `player` to the request.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    let telegramId: string;
    let username: string;

    if (process.env.DEV_MODE === 'true') {
      telegramId = process.env.DEV_USER_ID ?? '123456789';
      username = 'dev_user';
    } else {
      // Production: parse and validate Telegram initData
      const initData = request.headers['x-telegram-init-data'] as string | undefined;
      if (!initData) {
        return reply.status(401).send({ error: 'Missing Telegram initData' });
      }

      const parsed = parseTelegramInitData(initData);
      if (!parsed) {
        return reply.status(401).send({ error: 'Invalid initData' });
      }

      telegramId = String(parsed.user.id);
      username = parsed.user.username ?? parsed.user.first_name ?? '';
    }

    // Upsert player (auto-register on first login)
    let player = await prisma.player.findUnique({ where: { telegramId } });

    if (!player) {
      player = await createNewPlayer(telegramId, username);
    }

    (request as FastifyRequest & { player: typeof player }).player = player;
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Authentication error' });
  }
}

/**
 * Minimal Telegram initData parser.
 * TODO: add HMAC validation using TELEGRAM_BOT_TOKEN in production.
 */
function parseTelegramInitData(initData: string): { user: { id: number; username?: string; first_name?: string } } | null {
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (!userStr) return null;
    return { user: JSON.parse(userStr) };
  } catch {
    return null;
  }
}

async function createNewPlayer(telegramId: string, username: string) {
  // Get hero templates
  const templates = await prisma.heroTemplate.findMany();
  const templateMap = Object.fromEntries(templates.map((t) => [t.class, t]));

  const player = await prisma.player.create({
    data: {
      telegramId,
      username,
      base: {
        create: {
          level: 1,
          buildings: {
            createMany: {
              data: [
                { type: 'town_hall', level: 1 },
                { type: 'barracks', level: 1 },
                { type: 'forge', level: 1 },
                { type: 'laboratory', level: 1 },
                { type: 'storage', level: 1 },
                { type: 'map_room', level: 1 },
              ],
            },
          },
        },
      },
      resourceBalance: {
        create: { gold: 200, stone: 100, iron: 50, essence: 5, relics: 0 },
      },
    },
  });

  // Create starter heroes
  const starterClasses: HeroClass[] = ['guardian', 'ranger', 'occultist', 'medic'];
  const heroNames: Record<HeroClass, string> = {
    guardian: 'Aldric', ranger: 'Sylva', occultist: 'Morvyn', medic: 'Eryn',
  };

  for (const cls of starterClasses) {
    const tmpl = templateMap[cls];
    if (tmpl) {
      await prisma.hero.create({
        data: {
          name: heroNames[cls],
          playerId: player.id,
          templateId: tmpl.id,
          hp: tmpl.baseHp,
        },
      });
    }
  }

  return player;
}
