# Architecture Overview

## Monorepo Structure

```
labyrinth-game/
├── apps/web        React + Vite SPA served as Telegram Mini App
├── apps/api        Fastify REST API (stateless, JWT-less — uses Telegram auth)
├── packages/shared Pure TypeScript types and game constants shared by both apps
└── prisma/         Single schema, Prisma Client generated for the API
```

## Auth Flow

```
Telegram Client
  → sends initData in X-Telegram-Init-Data header
  → API validates HMAC (TODO in production)
  → upserts Player row on first visit
  → all subsequent requests use playerId derived from telegramId
```

In DEV_MODE the header is ignored and DEV_USER_ID is used directly.

## Data Flow: Expedition

```
POST /expedition/start
  → generates labyrinth graph (10-15 nodes)
  → stores nodes in ExpeditionNode table
  → links hero IDs via ExpeditionHero
  → sets currentNodeId = start node

POST /expedition/move { targetNodeId }
  → validates connection exists
  → marks node visited
  → if loot node → accumulates pendingLoot in Expedition.pendingLoot (JSON)
  → if pve_combat node → creates Combat + CombatParticipant rows
  → if exit node → enables extraction

POST /expedition/extract
  → requires currentNode.type === 'exit'
  → transfers pendingLoot → ResourceBalance (atomic transaction)
  → sets expedition.status = 'completed'
```

## Data Flow: Combat

```
POST /combat/action { action, targetId? }
  → processCombatAction() in combatEngine.ts
  → enemies AI runs immediately after player action (same turn)
  → updates CombatParticipant.hp/isAlive
  → appends to Combat.log (JSON array)
  → evaluateCombatOutcome() checks if all heroes/enemies dead
  → on defeat: expedition.status = 'failed', pendingLoot cleared
  → on victory: player returns to expedition, can continue exploring
```

## State Management (Frontend)

Zustand store (`gameStore.ts`) holds:
- `screen` — current UI screen
- `resources`, `heroes`, `buildings` — player state (loaded on mount)
- `expedition` — active expedition state
- `combat` — active combat state
- `lastResult` — results screen data

All API calls go through `api/client.ts` which adds the Telegram initData header automatically.

## PvP Architecture (Planned)

PvP is intentionally excluded from v1 but the architecture supports it:

1. Add `pvp_encounter` to `NodeType` enum
2. When a player enters a PvP node, the API checks for another active expedition in "encounter range"
3. If found, create a shared `PvpCombat` record linking both expeditions
4. Use WebSockets (e.g. Fastify + ws plugin) for real-time turn exchange
5. The loser drops pending loot; winner gains a portion

This design avoids changing the core expedition/combat models — PvP is additive.
