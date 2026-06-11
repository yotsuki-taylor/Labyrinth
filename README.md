# 🏰 Labyrinth — Telegram Mini App Game

PvE extraction roguelite in a procedural labyrinth. Runs **fully client-side** —
no backend or database required. Hosted as a static site on GitHub Pages and
opened as a Telegram Mini App.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite |
| Game logic | Runs in the browser (`apps/web/src/game/`) |
| Persistence | Telegram CloudStorage (cross-device) + `localStorage` fallback |
| Shared types | `@labyrinth/shared` (monorepo package) |
| Telegram | `telegram-web-app.js` (`window.Telegram.WebApp`) |
| Hosting | GitHub Pages (static) |

> **Note on the backend:** `apps/api/` and `prisma/` contain an earlier
> server-authoritative implementation. The game no longer uses them — all logic
> moved into the browser so the app can be hosted for free with no server. The
> server code is kept in the repo as a reference / starting point for a future
> online mode (PvP, leaderboards), which would need a real backend again.

## Project Structure

```
Labyrinth/
├── apps/
│   ├── web/              # React frontend — the actual game
│   │   └── src/game/     # Client-side engine (combat, labyrinth, save state)
│   └── api/              # [legacy] Fastify REST API (unused by the game)
├── packages/
│   └── shared/           # Shared TypeScript types & game constants
├── prisma/               # [legacy] Database schema & seed (unused)
├── .github/workflows/    # GitHub Pages deploy workflow
└── README.md
```

## How it works (client-side)

All gameplay runs in `apps/web/src/game/`:

| File | Responsibility |
|------|----------------|
| `engine.ts` | In-memory game state + all actions (expedition, combat, base, extract) |
| `labyrinth.ts` | Procedural labyrinth graph generation |
| `combat.ts` | Turn-based combat resolution, enemy AI, hero abilities |
| `state.ts` | Save-state shape and helpers |
| `storage.ts` | Persistence: Telegram CloudStorage + `localStorage` |

The Zustand store (`store/gameStore.ts`) calls the engine directly; React
screens never talk to a network. A new player (starter heroes, buildings, and
resources) is created automatically on first launch.

## Quick Start (local dev)

```bash
npm install
npm run dev --workspace=apps/web   # http://localhost:5173
```

To preview a production build at the GitHub Pages sub-path:

```bash
npm run build --workspace=apps/web
npm run preview --workspace=apps/web   # http://localhost:4173/Labyrinth/
```

In a normal browser there's no Telegram CloudStorage, so progress is saved to
`localStorage`. Inside Telegram (client version ≥ 6.9), progress also syncs to
CloudStorage across devices.

## Deployment (GitHub Pages)

Pushing changes under `apps/web/**` or `packages/shared/**` to `main` triggers
`.github/workflows/deploy.yml`, which builds the app and publishes it to GitHub
Pages. The repo's **Settings → Pages → Source** must be set to **GitHub Actions**.

The Vite `base` is set to `/Labyrinth/` to match the Pages sub-path
(`https://<user>.github.io/Labyrinth/`).

## Telegram Bot Setup

1. Create a bot via [@BotFather](https://t.me/BotFather).
2. Attach the Mini App URL as the bot's menu button (Bot API):
   ```
   POST https://api.telegram.org/bot<TOKEN>/setChatMenuButton
   { "menu_button": { "type": "web_app", "text": "⚔ Play",
     "web_app": { "url": "https://<user>.github.io/Labyrinth/" } } }
   ```
3. Open the bot in Telegram and tap the menu button to launch the game.

Because the game is single-player and client-side, no `initData` signature
validation is needed — there is no server to protect.

## Game Flow

```
Base Screen
  └─ Expedition Prep (select heroes)
       └─ Labyrinth Run (graph of nodes)
            ├─ Loot nodes (auto-collect resources)
            ├─ Combat nodes (turn-based fight)
            │    ├─ Victory → continue exploring
            │    └─ Defeat → lose all pending loot + the heroes on the run
            └─ Exit node
                 └─ Extract → resources added to base
                      └─ Results Screen → back to Base
```
