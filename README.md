# 🏰 Labyrinth — Telegram Mini App Game

PvPvE extraction roguelite in a procedural labyrinth.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + TypeScript + Fastify |
| Database | PostgreSQL |
| ORM | Prisma |
| Shared types | `@labyrinth/shared` (monorepo package) |
| Telegram | `@telegram-apps/sdk-react` |

## Project Structure

```
labyrinth-game/
├── apps/
│   ├── web/          # React frontend (Telegram Mini App)
│   └── api/          # Fastify REST API
├── packages/
│   └── shared/       # Shared TypeScript types & game constants
├── prisma/
│   ├── schema.prisma # Database schema
│   └── seed.ts       # Seed data
├── docs/             # Architecture notes
├── .env.example
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally
- npm 8+ (with workspaces support)

## Quick Start

### 1. Clone & install dependencies

```bash
git clone <repo>
cd labyrinth-game
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL to your PostgreSQL connection string
```

### 3. Set up the database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations (creates all tables)
npm run db:migrate

# Seed with hero templates and a demo player
npm run db:seed
```

### 4. Start development servers

```bash
# Starts both API (port 3001) and Web (port 5173) in parallel
npm run dev
```

Or start them individually:

```bash
npm run dev:api   # API only
npm run dev:web   # Frontend only
```

### 5. Open in browser

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Health check: http://localhost:3001/health
- Prisma Studio: `npm run db:studio`

## Dev Mode (no Telegram required)

Set `DEV_MODE=true` in `.env` (already set in `.env.example`).

In this mode, auth middleware uses `DEV_USER_ID` (default: `123456789`) as the Telegram ID and skips signature validation. The demo player from the seed is used automatically.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + DB ping |
| GET | `/player/me` | Full player state |
| GET | `/base` | Base with buildings |
| POST | `/base/upgrade` | Upgrade a building |
| GET | `/heroes` | All heroes |
| POST | `/expedition/start` | Start a new expedition |
| GET | `/expedition/current` | Active expedition |
| POST | `/expedition/move` | Move to a node |
| POST | `/expedition/extract` | Extract loot at exit |
| GET | `/combat/:id` | Get combat state |
| POST | `/combat/action` | Perform combat action |

All endpoints except `/health` require the `x-telegram-init-data` header (or `DEV_MODE=true`).

## Game Flow

```
Base Screen
  └─ Expedition Prep (select heroes)
       └─ Labyrinth Run (graph of nodes)
            ├─ Loot nodes (auto-collect resources)
            ├─ Combat nodes (turn-based fight)
            │    ├─ Victory → continue exploring
            │    └─ Defeat → lose all pending loot
            └─ Exit node
                 └─ Extract → resources added to base
                      └─ Results Screen → back to Base
```

## Telegram Bot Setup (for production)

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN` in `.env`
3. Set `DEV_MODE=false`
4. Enable HMAC validation in `apps/api/src/middleware/auth.ts` (marked as TODO)
5. Host the frontend and register the Mini App URL with BotFather
