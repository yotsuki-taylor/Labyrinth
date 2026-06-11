import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { healthRoutes } from './routes/health.js';
import { playerRoutes } from './routes/player.js';
import { baseRoutes } from './routes/base.js';
import { heroRoutes } from './routes/heroes.js';
import { expeditionRoutes } from './routes/expedition.js';
import { combatRoutes } from './routes/combat.js';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

// ─── Plugins ──────────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});
await app.register(helmet, { contentSecurityPolicy: false });

// ─── Routes ───────────────────────────────────────────────────────────────────
await app.register(healthRoutes);
await app.register(playerRoutes);
await app.register(baseRoutes);
await app.register(heroRoutes);
await app.register(expeditionRoutes);
await app.register(combatRoutes);

// ─── Start ────────────────────────────────────────────────────────────────────
const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  console.log(`\n🏰 Labyrinth API running at http://localhost:${port}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
