# TODO — Labyrinth Game Roadmap

This document tracks planned features and known gaps in the current foundation.

---

## 🔴 Critical (before any real testing)

- [ ] **Telegram HMAC auth** — `apps/api/src/middleware/auth.ts` has a TODO for signature validation. Must be implemented before any public deployment.
- [ ] **Hero recovery** — Dead heroes have no recovery mechanic yet. Add a time-based or resource-based revival system.
- [ ] **API input validation** — Add Zod schemas to all POST routes. Currently bodies are trusted as-is.
- [ ] **Error handling** — Standardize error responses across all routes (`{ error, code, details }`).

---

## 🟡 Core Gameplay

- [ ] **Hero leveling** — Heroes gain XP after combat victories. Level-up triggers are generated but XP is never awarded.
- [ ] **Building effects** — Buildings have levels but no gameplay effects yet. Implement: Barracks → hero unlock/upgrade, Forge → equipment slots, Lab → passive bonuses, Storage → resource cap, Map Room → labyrinth size (partially done).
- [ ] **Loot at start node** — Loot config is created but `loot_found` event doesn't fire on revisit prevention; also the start node should not give loot.
- [ ] **Multiple enemies per node** — `generateEnemy` creates one enemy; add support for enemy groups.
- [ ] **Initiative / speed system** — Turn order should be determined by `speed` stat, not heroes-first.
- [ ] **Status effects** — Poison, stun, shield buff tracking in combat.
- [ ] **Death state** — `isAlive: false` heroes show up correctly in UI but there's no hard block on selecting them for future expeditions if they're falsely alive.

---

## 🟢 PvP (Future)

- [ ] **Architecture note**: The expedition system is designed to support PvP encounters as a new `NodeType = 'pvp_encounter'`. When a player enters such a node, the backend can match them with another active expedition in the same labyrinth.
- [ ] Add `pvp_encounter` NodeType to shared types.
- [ ] Implement WebSocket or polling for real-time PvP.
- [ ] Design loot-stealing mechanics on PvP death.
- [ ] Add PvP matchmaking queue.

---

## 🔵 Polish & UX

- [ ] **Loading states** — Skeleton screens instead of raw "loading..." text.
- [ ] **Animations** — Combat hit animations, loot pickup, node transitions.
- [ ] **Sound effects** — Telegram WebApp has audio API support.
- [ ] **Telegram BackButton** — Wire up `Telegram.WebApp.BackButton` to screen navigation.
- [ ] **Telegram MainButton** — Use for primary actions (Extract, Attack).
- [ ] **Responsive layout** — Test on various phone screen sizes.
- [ ] **Dark theme tokens** — Extract CSS variables / Telegram theme params.
- [ ] **Haptic feedback** — `Telegram.WebApp.HapticFeedback` on actions.

---

## 🔷 Infrastructure

- [ ] **Docker Compose** — Add `docker-compose.yml` for local Postgres + API.
- [ ] **CI/CD** — GitHub Actions for lint, type check, and migration validation.
- [ ] **Rate limiting** — Add `@fastify/rate-limit` to prevent spam.
- [ ] **Logging** — Structured logs with correlation IDs per player.
- [ ] **DB migrations** — Add `prisma/migrations/` to version control after first proper migration.
- [ ] **Automated tests** — Unit tests for `combatEngine.ts` and `labyrinthGenerator.ts`. Integration tests for critical API routes.
- [ ] **Environment validation** — Use `zod` to validate all env vars at startup.

---

## 💡 Future Content

- [ ] More hero classes (Berserker, Healer, Assassin)
- [ ] Equipment system (Forge) — items with stat modifiers
- [ ] Passive research tree (Laboratory)
- [ ] Named boss nodes at the end of each labyrinth
- [ ] Daily/weekly challenges
- [ ] Leaderboards
- [ ] Guild system
- [ ] Seasonal events
