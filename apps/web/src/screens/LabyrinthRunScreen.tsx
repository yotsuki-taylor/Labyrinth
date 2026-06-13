import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { engine } from '../game/engine.js';
import type { ExpeditionDTO, RoomType, HeroStats } from '@labyrinth/shared';

// ── Monster types ──────────────────────────────────────────────────────────
type MonsterType = 'skeleton' | 'wolf' | 'golem';

interface Monster {
  id: string;
  type: MonsterType;
  x: number; y: number;
  hp: number; maxHp: number;
  attack: number;
  attackRate: number;   // hits / second
  speed: number;        // tiles / second
  aggroRange: number;   // tiles
  lastAttackAt: number; // performance.now() timestamp
  aggro: boolean;
  dead: boolean;
  deadAt: number;
  hitFlash: number;     // 0–1 decays on hit
}

const MONSTER_BASE: Record<MonsterType, Omit<Monster, 'id'|'x'|'y'|'lastAttackAt'|'aggro'|'dead'|'deadAt'|'hitFlash'>> = {
  skeleton: { type: 'skeleton', hp: 30,  maxHp: 30,  attack: 7,  attackRate: 0.9, speed: 1.4, aggroRange: 4.5 },
  wolf:     { type: 'wolf',     hp: 22,  maxHp: 22,  attack: 11, attackRate: 1.6, speed: 2.3, aggroRange: 5.5 },
  golem:    { type: 'golem',    hp: 70,  maxHp: 70,  attack: 18, attackRate: 0.6, speed: 0.7, aggroRange: 3.0 },
};
const MONSTER_ICON: Record<MonsterType, string> = { skeleton: '☠️', wolf: '🐺', golem: '🗿' };

// Spawn counts per room type: [min, max]
const MONSTER_COUNTS: Record<string, [number, number]> = {
  start: [0, 0], empty: [0, 1], loot: [1, 3], treasure: [2, 4],
};
const MONSTER_POOL: Record<string, MonsterType[]> = {
  start: [], empty: ['skeleton'], loot: ['skeleton', 'wolf'],
  treasure: ['skeleton', 'wolf', 'golem'],
};

const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

function spawnMonsters(room: ExpeditionDTO['room']): Monster[] {
  const { type, width, height, depth } = room;
  const [mn, mx] = MONSTER_COUNTS[type] ?? [0, 0];
  const pool = MONSTER_POOL[type] ?? [];
  if (!pool.length) return [];
  const count = ri(mn, mx);
  const scale = 1 + depth * 0.12;
  const used = new Set<string>();
  const out: Monster[] = [];
  for (let i = 0; i < count * 12 && out.length < count; i++) {
    const x = ri(2, width - 3);
    const y = ri(2, height - 5);
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);
    const mType = pool[Math.floor(Math.random() * pool.length)];
    const base = MONSTER_BASE[mType];
    out.push({
      ...base,
      id: `m${i}_${Date.now()}`,
      x, y,
      hp: Math.round(base.maxHp * scale),
      maxHp: Math.round(base.maxHp * scale),
      attack: Math.round(base.attack * scale),
      lastAttackAt: 0,
      aggro: false,
      dead: false,
      deadAt: 0,
      hitFlash: 0,
    });
  }
  return out;
}

// ── Skill definitions per class ────────────────────────────────────────────
const SKILL_ICON: Record<string, string> = {
  warrior: '🛡️', ranger: '🏹', warlock: '💀', cleric: '💊',
  assassin: '🗡️', sorcerer: '⚡', paladin: '✝️', barbarian: '🪓',
  druid: '🌿', bard: '🎵', alchemist: '⚗️', inventor: '🔧',
};
// Radius 0 = targets single nearest enemy
const SKILL_RADIUS: Record<string, number> = {
  warrior: 0, ranger: 4.0, warlock: 2.5, cleric: 0,
  assassin: 0, sorcerer: 3.0, paladin: 0, barbarian: 2.0,
  druid: 2.5, bard: 0, alchemist: 2.5, inventor: 3.5,
};
const SKILL_DMG: Record<string, number> = {
  warrior: 0, ranger: 50, warlock: 30, cleric: 0,
  assassin: 96, sorcerer: 25, paladin: 0, barbarian: 44,
  druid: 20, bard: 0, alchemist: 40, inventor: 15,
};
const SKILL_HEAL: Record<string, number> = {
  warrior: 20, cleric: 25, paladin: 20, bard: 10, druid: 15,
};

// ── Movement / combat constants ────────────────────────────────────────────
const SPEED       = 3.4;
const PLAYER_R    = 0.30;
const PICKUP_R    = 0.75;
const EXIT_R      = 0.85;
const ATTACK_R    = 1.35;   // tiles — interact button becomes ATTACK
const ATTACK_CD   = 1.2;    // seconds between basic attacks
const INTERACT_S  = 0.9;    // seconds to hold-collect
const SKILL_CD    = 8;

const RES_ICON: Record<string, string> = {
  gold: '🪙', stone: '🪨', iron: '⚙️', essence: '✨', relics: '🔮',
};

function roomPreviewIcon(type: RoomType, isExtract: boolean): string {
  if (isExtract) return '🚪';
  if (type === 'loot') return '💰';
  if (type === 'treasure') return '💎';
  return '·';
}

// ── Component ──────────────────────────────────────────────────────────────
export function LabyrinthRunScreen() {
  const { expedition, heroes, collectPickup, enterExit, heroDefeated, setScreen, error } = useGameStore();

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const playerRef      = useRef({ x: 0, y: 0 });
  const joyRef         = useRef({ active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, tid: -1 });
  const keysRef        = useRef(new Set<string>());
  const expRef         = useRef<ExpeditionDTO | null>(expedition);
  const collectedRef   = useRef(new Set<string>());
  const busyRef        = useRef(false);
  const rafRef         = useRef(0);
  const lastTRef       = useRef(0);
  const heroImgRef     = useRef<HTMLImageElement | null>(null);
  const heroLoadedRef  = useRef(false);
  const cameraRef      = useRef({ x: 0, y: 0 });
  const heroClassRef   = useRef('warrior');
  // Hero stats (live during run)
  const heroHpRef      = useRef(100);
  const heroMaxHpRef   = useRef(100);
  const heroStatsRef   = useRef<HeroStats>({ hp: 100, maxHp: 100, attack: 15, defense: 10, speed: 8 });
  // Monsters
  const monstersRef    = useRef<Monster[]>([]);
  const nearEnemyRef   = useRef<Monster | null>(null);
  const attackCoolRef  = useRef(0);
  // Interact (collect)
  const nearPickupRef  = useRef<string | null>(null);
  const interactHeld   = useRef(false);
  const interactTid    = useRef(-1);
  const interactProg   = useRef(0);
  // Skill
  const skillCool      = useRef(0);
  const skillFlash     = useRef(0);
  const skillTid       = useRef(-1);
  // Defeat guard
  const defeatedRef    = useRef(false);

  useEffect(() => { expRef.current = expedition; }, [expedition]);

  const heroClass = expedition
    ? heroes.find(h => h.id === expedition.heroId)?.class
    : undefined;

  useEffect(() => { heroClassRef.current = heroClass ?? 'warrior'; }, [heroClass]);

  useEffect(() => {
    if (!heroClass) return;
    const img = new Image();
    heroLoadedRef.current = false;
    img.onload = () => { heroLoadedRef.current = true; };
    img.src = `${import.meta.env.BASE_URL}heroes/${heroClass}.png`;
    heroImgRef.current = img;
  }, [heroClass]);

  // Reset on new room: player position, monsters, HP init.
  useEffect(() => {
    if (!expedition) return;
    const { width, height } = expedition.room;
    playerRef.current  = { x: (width - 1) / 2, y: height - 1 };
    cameraRef.current  = { x: (width - 1) / 2, y: height - 1 };
    collectedRef.current = new Set(
      expedition.room.pickups.filter(p => p.collected).map(p => p.id),
    );
    busyRef.current      = false;
    defeatedRef.current  = false;
    interactProg.current = 0;
    nearPickupRef.current = null;
    nearEnemyRef.current  = null;
    attackCoolRef.current = 0;
    monstersRef.current   = spawnMonsters(expedition.room);

    // Init hero HP from store on expedition start; preserve across rooms.
    const hero = heroes.find(h => h.id === expedition.heroId);
    if (hero) {
      heroStatsRef.current = hero.stats;
      heroMaxHpRef.current = hero.stats.maxHp;
      // First room of expedition → use actual saved HP; subsequent rooms preserve battle HP.
      if (expedition.depth === 0) {
        heroHpRef.current = hero.stats.hp;
      } else {
        heroHpRef.current = Math.min(heroHpRef.current, hero.stats.maxHp);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedition?.room.id]);

  const triggerSkill = useCallback(() => {
    if (skillCool.current > 0) return;
    skillCool.current  = SKILL_CD;
    skillFlash.current = 0.6;

    const cls    = heroClassRef.current;
    const radius = SKILL_RADIUS[cls] ?? 0;
    const dmg    = SKILL_DMG[cls]    ?? 0;
    const heal   = SKILL_HEAL[cls]   ?? 0;
    const p      = playerRef.current;

    if (dmg > 0) {
      for (const m of monstersRef.current) {
        if (m.dead) continue;
        const dist = Math.hypot(p.x - m.x, p.y - m.y);
        const inRange = radius === 0 ? dist < ATTACK_R : dist < radius;
        if (inRange) {
          m.hp -= dmg;
          m.hitFlash = 1;
          if (m.hp <= 0) { m.dead = true; m.deadAt = performance.now(); }
        }
      }
    }
    if (heal > 0) {
      heroHpRef.current = Math.min(heroMaxHpRef.current, heroHpRef.current + heal);
    }
  }, []);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === 'e' || e.key === 'E') interactHeld.current = true;
      if (e.key === 'q' || e.key === 'Q') triggerSkill();
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
      if (e.key === 'e' || e.key === 'E') interactHeld.current = false;
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [triggerSkill]);

  const doCollect = useCallback((id: string) => {
    if (collectedRef.current.has(id)) return;
    collectedRef.current.add(id);
    void collectPickup(id);
  }, [collectPickup]);

  const doExit = useCallback((id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    engine.syncHeroHp(heroHpRef.current);
    void enterExit(id);
  }, [enterExit]);

  const doHeroDefeated = useCallback(() => {
    if (defeatedRef.current) return;
    defeatedRef.current = true;
    busyRef.current = true;
    void heroDefeated();
  }, [heroDefeated]);

  // ─── Render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !expedition) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const { width: RW, height: RH } = expedition.room;

    const TW = 180;
    const TH = TW / 2;
    const WALL_H = TH * 2;   // side-face height in screen pixels

    const IBTN = { x: W - 65, y: H - 80,  r: 34 };
    const SBTN = { x: W - 65, y: H - 170, r: 34 };

    const wallSet = new Set<string>(expedition.room.walls ?? []);

    function playerBlocked(x: number, y: number): boolean {
      const r = PLAYER_R;
      return (
        wallSet.has(`${Math.floor(x + r)},${Math.floor(y)}`) ||
        wallSet.has(`${Math.floor(x - r)},${Math.floor(y)}`) ||
        wallSet.has(`${Math.floor(x)},${Math.floor(y + r)}`) ||
        wallSet.has(`${Math.floor(x)},${Math.floor(y - r)}`) ||
        wallSet.has(`${Math.floor(x + r * 0.7)},${Math.floor(y + r * 0.7)}`) ||
        wallSet.has(`${Math.floor(x + r * 0.7)},${Math.floor(y - r * 0.7)}`) ||
        wallSet.has(`${Math.floor(x - r * 0.7)},${Math.floor(y + r * 0.7)}`) ||
        wallSet.has(`${Math.floor(x - r * 0.7)},${Math.floor(y - r * 0.7)}`)
      );
    }

    function toScreen(tx: number, ty: number) {
      const cam = cameraRef.current;
      return {
        sx: (tx - ty - (cam.x - cam.y)) * (TW / 2) + W / 2,
        sy: (tx + ty - (cam.x + cam.y)) * (TH / 2) + H * 0.55,
      };
    }

    const inRoom = (x: number, y: number) =>
      x >= 0 && x <= RW - 1 && y >= 0 && y <= RH - 1;

    function exitPos(side: 'left' | 'right') {
      return { x: side === 'left' ? RW * 0.24 : RW * 0.76, y: -0.15 };
    }
    const entrancePos = { x: (RW - 1) / 2, y: RH - 0.85 };

    const noScroll = (e: TouchEvent) => e.preventDefault();
    canvas.addEventListener('touchstart', noScroll, { passive: false });
    canvas.addEventListener('touchmove',  noScroll, { passive: false });

    function drawDiamond(sx: number, sy: number, tw: number, th: number, fill: string | CanvasGradient, stroke?: string) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tw / 2, sy + th / 2);
      ctx.lineTo(sx, sy + th);
      ctx.lineTo(sx - tw / 2, sy + th / 2);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }

    function drawWallBox(sx: number, sy: number) {
      // Left face — NW side, shadow
      ctx.beginPath();
      ctx.moveTo(sx - TW / 2, sy + TH / 2);
      ctx.lineTo(sx - TW / 2, sy + TH / 2 + WALL_H);
      ctx.lineTo(sx,           sy + TH       + WALL_H);
      ctx.lineTo(sx,           sy + TH);
      ctx.closePath();
      const lg = ctx.createLinearGradient(sx - TW / 2, sy, sx, sy + TH + WALL_H);
      lg.addColorStop(0, '#252538'); lg.addColorStop(1, '#111118');
      ctx.fillStyle = lg; ctx.fill();
      ctx.strokeStyle = '#0e0e18'; ctx.lineWidth = 1; ctx.stroke();

      // Right face — NE side, slightly lighter
      ctx.beginPath();
      ctx.moveTo(sx + TW / 2, sy + TH / 2);
      ctx.lineTo(sx + TW / 2, sy + TH / 2 + WALL_H);
      ctx.lineTo(sx,           sy + TH       + WALL_H);
      ctx.lineTo(sx,           sy + TH);
      ctx.closePath();
      const rg = ctx.createLinearGradient(sx, sy, sx + TW / 2, sy + TH + WALL_H);
      rg.addColorStop(0, '#38384e'); rg.addColorStop(1, '#1a1a26');
      ctx.fillStyle = rg; ctx.fill();
      ctx.strokeStyle = '#0e0e18'; ctx.lineWidth = 1; ctx.stroke();

      // Top face — lit from above
      ctx.beginPath();
      ctx.moveTo(sx,           sy);
      ctx.lineTo(sx + TW / 2,  sy + TH / 2);
      ctx.lineTo(sx,           sy + TH);
      ctx.lineTo(sx - TW / 2,  sy + TH / 2);
      ctx.closePath();
      const tg = ctx.createLinearGradient(sx - TW / 2, sy + TH / 2, sx + TW / 2, sy + TH / 2);
      tg.addColorStop(0, '#4a4a62'); tg.addColorStop(0.5, '#545470'); tg.addColorStop(1, '#42425a');
      ctx.fillStyle = tg; ctx.fill();
      ctx.strokeStyle = '#2e2e42'; ctx.lineWidth = 1; ctx.stroke();
    }

    function drawFloor() {
      for (let sum = 0; sum <= (RW - 1) + (RH - 1); sum++) {
        for (let col = 0; col < RW; col++) {
          const row = sum - col;
          if (row < 0 || row >= RH) continue;
          const { sx, sy } = toScreen(col, row);
          if (sx < -TW || sx > W + TW || sy < -TH * 2 - WALL_H || sy > H + TH * 2) continue;

          if (wallSet.has(`${col},${row}`)) {
            // Dark base tile under wall
            drawDiamond(sx, sy, TW * 0.98, TH * 0.98, '#0d0d18', '#0a0a14');
            drawWallBox(sx, sy);
          } else {
            const g = ctx.createLinearGradient(sx, sy, sx, sy + TH);
            g.addColorStop(0, '#3c3c5a'); g.addColorStop(0.6, '#2a2a42'); g.addColorStop(1, '#191929');
            drawDiamond(sx, sy, TW * 0.98, TH * 0.98, g, '#20203a');
          }
        }
      }
    }

    function drawEntrance(t: number) {
      const { sx, sy } = toScreen(entrancePos.x, entrancePos.y);
      ctx.globalAlpha = 0.5 + 0.15 * Math.sin(t * 2);
      ctx.font = `${Math.round(TW * 0.5)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⛩️', sx, sy);
      ctx.globalAlpha = 1;
    }

    function drawExits(t: number) {
      const exp = expRef.current; if (!exp) return;
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.6);
      for (const ex of exp.room.exits) {
        const p = exitPos(ex.side);
        const { sx, sy } = toScreen(p.x, p.y);
        const color = ex.isExtract ? '#4ade80' : ex.leadsTo === 'treasure' ? '#facc15' : ex.leadsTo === 'loot' ? '#c9b0ff' : '#7a8cff';
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, TW * 0.9 * pulse);
        grd.addColorStop(0, color + '66'); grd.addColorStop(1, color + '00');
        ctx.beginPath(); ctx.arc(sx, sy, TW * 0.9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        ctx.font = `${Math.round(TW * 0.85)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🚪', sx, sy);
        ctx.font = `${Math.round(TW * 0.5)}px sans-serif`;
        ctx.fillText(roomPreviewIcon(ex.leadsTo, ex.isExtract), sx, sy - TW * 0.7);
        ctx.font = '700 11px sans-serif'; ctx.fillStyle = color;
        ctx.fillText(ex.isExtract ? 'EXTRACT' : ex.leadsTo.toUpperCase(), sx, sy + TW * 0.55);
      }
    }

    function drawPickups(t: number) {
      const exp = expRef.current; if (!exp) return;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const pk of exp.room.pickups) {
        if (pk.collected || collectedRef.current.has(pk.id)) continue;
        const isNear = nearPickupRef.current === pk.id;
        const bob = Math.sin(t * 3 + pk.x + pk.y) * (TH * 0.12);
        const { sx, sy } = toScreen(pk.x, pk.y);
        ctx.beginPath();
        ctx.ellipse(sx, sy + TH * 0.1, TW * 0.18, TH * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
        if (isNear) {
          ctx.beginPath();
          ctx.arc(sx, sy - 6 + bob, TW * 0.42 * (0.85 + 0.15 * Math.sin(t * 6)), 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(74,222,128,0.65)'; ctx.lineWidth = 2.5; ctx.stroke();
        }
        const grd = ctx.createRadialGradient(sx, sy - 6 + bob, 0, sx, sy - 6 + bob, TW * 0.34);
        grd.addColorStop(0, 'rgba(250,204,21,0.45)'); grd.addColorStop(1, 'rgba(250,204,21,0)');
        ctx.beginPath(); ctx.arc(sx, sy - 6 + bob, TW * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        ctx.font = `${Math.round(TW * 0.5)}px sans-serif`;
        ctx.fillText(RES_ICON[pk.resource] ?? '💰', sx, sy - 6 + bob);
      }
    }

    function drawMonsters(t: number) {
      const now = performance.now();
      // Depth-sort (back-to-front) by tile diagonal
      const sorted = [...monstersRef.current].sort((a, b) => (a.x + a.y) - (b.x + b.y));
      for (const m of sorted) {
        const { sx, sy } = toScreen(m.x, m.y);
        const footY = sy + TH / 2;
        const mSize = TW * 0.48;
        const mH    = mSize * 1.1;

        if (m.dead) {
          const age = (now - m.deadAt) / 1000;
          if (age > 1.0) continue;
          ctx.globalAlpha = Math.max(0, 1 - age);
          ctx.font = `${Math.round(mSize * 0.9)}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText('💨', sx, footY - age * 36);
          ctx.globalAlpha = 1;
          continue;
        }

        // Floor shadow
        ctx.beginPath();
        ctx.ellipse(sx, footY, mSize * 0.38, mSize * 0.14, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill();

        // Aggro pulse ring
        if (m.aggro) {
          ctx.beginPath();
          ctx.arc(sx, footY - mH * 0.5, mSize * 0.48 * (0.9 + 0.1 * Math.sin(t * 8)), 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239,68,68,0.72)'; ctx.lineWidth = 2; ctx.stroke();
        }

        // Hit flash overlay
        if (m.hitFlash > 0) {
          ctx.beginPath();
          ctx.arc(sx, footY - mH * 0.5, mSize * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,80,80,${(m.hitFlash * 0.45).toFixed(2)})`;
          ctx.fill();
        }

        // Icon
        ctx.font = `${Math.round(mSize)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(MONSTER_ICON[m.type], sx, footY);

        // HP bar
        const bw = mSize * 0.9, bh = 5;
        const bx = sx - bw / 2, by = footY - mH - 10;
        const ratio = Math.max(0, m.hp / m.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#facc15' : '#f87171';
        ctx.fillRect(bx, by, bw * ratio, bh);
      }
    }

    function drawPlayer(t: number) {
      const p = playerRef.current;
      const { sx, sy } = toScreen(p.x, p.y);
      const r      = Math.max(11, TW * 0.32);
      const footY  = sy + TH / 2;
      const charH  = r * 2.2;
      const charTopY = footY - charH;
      const charCY   = footY - charH / 2;

      // Floor shadow
      ctx.beginPath();
      ctx.ellipse(sx, footY, r * 0.72, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();

      // Skill flash burst
      if (skillFlash.current > 0) {
        const cls    = heroClassRef.current;
        const radius = SKILL_RADIUS[cls] ?? 0;
        const fa     = Math.min(1, skillFlash.current * 1.8);
        // Radial glow
        const fg = ctx.createRadialGradient(sx, charCY, 0, sx, charCY, r * 3.5);
        fg.addColorStop(0, `rgba(201,176,255,${fa.toFixed(2)})`);
        fg.addColorStop(1, 'rgba(201,176,255,0)');
        ctx.beginPath(); ctx.arc(sx, charCY, r * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = fg; ctx.fill();
        // Skill radius ring in iso space
        if (radius > 0) {
          ctx.beginPath();
          ctx.ellipse(sx, footY, radius * TW / 2, radius * TH / 2, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(201,176,255,${(skillFlash.current * 0.9).toFixed(2)})`;
          ctx.fillStyle   = `rgba(201,176,255,${(skillFlash.current * 0.10).toFixed(2)})`;
          ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
        }
      }

      // Aura
      const glow = r + 4 + 2 * Math.sin(t * 4);
      const grd  = ctx.createRadialGradient(sx, charCY, 0, sx, charCY, glow + 8);
      grd.addColorStop(0, 'rgba(201,176,255,0.6)'); grd.addColorStop(1, 'rgba(201,176,255,0)');
      ctx.beginPath(); ctx.arc(sx, charCY, glow + 8, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();

      // Sprite (natural proportions, no clip)
      const img = heroImgRef.current;
      if (img && heroLoadedRef.current && img.naturalWidth > 0) {
        const displayW = charH * (img.naturalWidth / img.naturalHeight);
        ctx.drawImage(img, sx - displayW / 2, charTopY, displayW, charH);
      } else {
        ctx.fillStyle = '#c9b0ff';
        ctx.fillRect(sx - charH * 0.28, charTopY, charH * 0.55, charH);
      }
    }

    function drawHeroHpBar() {
      const hp    = heroHpRef.current;
      const maxHp = heroMaxHpRef.current;
      const ratio = Math.max(0, hp / maxHp);
      const bw = 140, bh = 8, cx = W / 2, by = H - 22;
      ctx.fillStyle = 'rgba(10,10,25,0.82)';
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2 - 12, by - bh / 2 - 7, bw + 24, bh + 18, 7);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e'; ctx.fillRect(cx - bw / 2, by - bh / 2, bw, bh);
      ctx.fillStyle = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#facc15' : '#f87171';
      ctx.fillRect(cx - bw / 2, by - bh / 2, bw * ratio, bh);
      ctx.font = '700 10px sans-serif';
      ctx.fillStyle = '#c9b0ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`❤️ ${hp} / ${maxHp}`, cx, by + 8);
    }

    function drawJoystick() {
      const joy = joyRef.current;
      if (joy.active) {
        ctx.beginPath(); ctx.arc(joy.baseX, joy.baseY, 46, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,15,40,0.6)'; ctx.fill();
        ctx.strokeStyle = 'rgba(120,120,210,0.5)'; ctx.lineWidth = 2; ctx.stroke();
        const kx = joy.baseX + joy.dx * 34, ky = joy.baseY + joy.dy * 34;
        ctx.beginPath(); ctx.arc(kx, ky, 24, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(91,58,156,0.9)'; ctx.fill();
        ctx.strokeStyle = 'rgba(200,176,255,0.6)'; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(70, H - 70, 42, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120,120,200,0.25)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(140,140,190,0.5)';
        ctx.textAlign = 'center'; ctx.fillText('MOVE', 70, H - 70);
      }
    }

    function drawCircleBtn(
      bx: number, by: number, r: number,
      active: boolean, icon: string, label: string, progress: number, rgb: string,
    ) {
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = active ? `rgba(${rgb},0.22)` : 'rgba(10,10,25,0.78)'; ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.strokeStyle = active ? `rgba(${rgb},0.9)` : 'rgba(80,80,120,0.45)';
      ctx.lineWidth = 2; ctx.stroke();
      if (progress > 0) {
        ctx.beginPath();
        ctx.arc(bx, by, r + 5, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb},1)`; ctx.lineWidth = 4;
        ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
      }
      ctx.globalAlpha = active ? 1 : 0.42;
      ctx.font = `${Math.round(r * 0.72)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icon, bx, by - 3);
      ctx.globalAlpha = 1;
      ctx.font = `700 ${Math.round(r * 0.30)}px sans-serif`;
      ctx.fillStyle = active ? `rgba(${rgb},1)` : 'rgba(140,140,190,0.55)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx, by + r * 0.55);
    }

    function drawButtons() {
      const enemy   = nearEnemyRef.current;
      const pickup  = nearPickupRef.current;
      const atkCool = attackCoolRef.current;

      // Interact / Attack button
      if (enemy !== null) {
        // Attack mode — red
        const atkProg = atkCool > 0 ? atkCool / ATTACK_CD : 0; // depletes as recharges
        drawCircleBtn(IBTN.x, IBTN.y, IBTN.r, true, '⚔️', 'ATK', atkProg, '239,68,68');
      } else if (pickup !== null) {
        // Collect mode — green
        const pk = expRef.current?.room.pickups.find(p => p.id === pickup);
        const icon = pk ? (RES_ICON[pk.resource] ?? '🖐️') : '🖐️';
        drawCircleBtn(IBTN.x, IBTN.y, IBTN.r, true, icon, 'HOLD E', interactProg.current, '74,222,128');
      } else {
        drawCircleBtn(IBTN.x, IBTN.y, IBTN.r, false, '🖐️', 'E', 0, '74,222,128');
      }

      // Skill button
      const cd    = skillCool.current;
      const ready = cd <= 0;
      const flash = skillFlash.current > 0;
      if (flash) {
        ctx.beginPath(); ctx.arc(SBTN.x, SBTN.y, SBTN.r + 10, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201,176,255,${(skillFlash.current * 0.8).toFixed(2)})`; ctx.fill();
      }
      const rechargeProg = ready ? 0 : (SKILL_CD - cd) / SKILL_CD;
      drawCircleBtn(
        SBTN.x, SBTN.y, SBTN.r, ready || flash,
        SKILL_ICON[heroClassRef.current] ?? '⚡',
        ready ? 'Q SKILL' : `${Math.ceil(cd)}s`,
        rechargeProg,
        flash ? '220,180,255' : '201,176,255',
      );
    }

    function loop(now: number) {
      const dt  = Math.min((now - (lastTRef.current || now)) / 1000, 0.05);
      lastTRef.current = now;
      const t   = now / 1000;
      const p   = playerRef.current;
      const exp = expRef.current;

      // ── Player movement ──
      const joy  = joyRef.current;
      const keys = keysRef.current;
      let mdx = joy.active ? joy.dx : 0;
      let mdy = joy.active ? joy.dy : 0;
      if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) mdy -= 1;
      if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) mdy += 1;
      if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) mdx -= 1;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) mdx += 1;
      const mlen = Math.hypot(mdx, mdy);
      if (mlen > 1) { mdx /= mlen; mdy /= mlen; }

      if (!busyRef.current && (mdx || mdy)) {
        const step = SPEED * dt;
        const nx = p.x + mdx * step, ny = p.y + mdy * step;
        if (inRoom(nx, p.y + PLAYER_R) && inRoom(nx, p.y - PLAYER_R) && !playerBlocked(nx, p.y)) p.x = nx;
        let canY = inRoom(p.x + PLAYER_R, ny) && inRoom(p.x - PLAYER_R, ny);
        if (!canY && ny < 0 && exp) {
          for (const ex of exp.room.exits) {
            const ep = exitPos(ex.side);
            if (Math.abs(p.x - ep.x) < 1.1 && ny > -0.6) { canY = true; break; }
          }
        }
        if (canY && !playerBlocked(p.x, ny)) p.y = ny;
      }

      // Camera lerp
      const cam = cameraRef.current;
      const lf  = Math.min(1, 8 * dt);
      cam.x += (p.x - cam.x) * lf;
      cam.y += (p.y - cam.y) * lf;

      if (!busyRef.current && exp) {
        // ── Near-enemy detection ──
        let nearest: Monster | null = null;
        let nearDist = ATTACK_R;
        for (const m of monstersRef.current) {
          if (m.dead) continue;
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d < nearDist) { nearDist = d; nearest = m; }
        }
        nearEnemyRef.current = nearest;

        // ── Near-pickup detection ──
        let nearPk: string | null = null;
        let nearPkDist = PICKUP_R;
        for (const pk of exp.room.pickups) {
          if (pk.collected || collectedRef.current.has(pk.id)) continue;
          const d = Math.hypot(p.x - pk.x, p.y - pk.y);
          if (d < nearPkDist) { nearPkDist = d; nearPk = pk.id; }
        }
        nearPickupRef.current = nearest !== null ? null : nearPk; // enemy has priority

        // ── Interact button action ──
        attackCoolRef.current = Math.max(0, attackCoolRef.current - dt);
        if (interactHeld.current) {
          if (nearest !== null && attackCoolRef.current <= 0) {
            // Attack
            attackCoolRef.current = ATTACK_CD;
            nearest.hp -= heroStatsRef.current.attack;
            nearest.hitFlash = 1;
            if (nearest.hp <= 0) {
              nearest.dead = true;
              nearest.deadAt = performance.now();
              nearEnemyRef.current = null;
            }
          } else if (nearest === null && nearPk !== null) {
            // Collect channel
            interactProg.current = Math.min(1, interactProg.current + dt / INTERACT_S);
            if (interactProg.current >= 1) {
              interactProg.current = 0;
              doCollect(nearPk);
            }
          }
        } else {
          interactProg.current = Math.max(0, interactProg.current - dt * 4);
        }

        // ── Monster AI ──
        for (const m of monstersRef.current) {
          if (m.dead) continue;
          m.hitFlash = Math.max(0, m.hitFlash - dt * 8);
          const dist = Math.hypot(p.x - m.x, p.y - m.y);
          if (dist < m.aggroRange) m.aggro = true;
          if (!m.aggro) continue;

          // Move toward player
          if (dist > 0.7) {
            const nx2 = m.x + ((p.x - m.x) / dist) * m.speed * dt;
            const ny2 = m.y + ((p.y - m.y) / dist) * m.speed * dt;
            if (nx2 >= 0 && nx2 <= RW - 1) m.x = nx2;
            if (ny2 >= 0 && ny2 <= RH - 1) m.y = ny2;
          }

          // Attack player
          const msSinceAtk = performance.now() - m.lastAttackAt;
          if (dist < 1.0 && msSinceAtk >= 1000 / m.attackRate) {
            m.lastAttackAt = performance.now();
            heroHpRef.current = Math.max(0, heroHpRef.current - m.attack);
            if (heroHpRef.current <= 0) doHeroDefeated();
          }
        }

        // ── Exit triggers ──
        for (const ex of exp.room.exits) {
          const ep = exitPos(ex.side);
          if (Math.hypot(p.x - ep.x, p.y - ep.y) < EXIT_R) { doExit(ex.id); break; }
        }
      }

      // Cooldowns
      skillCool.current  = Math.max(0, skillCool.current  - dt);
      skillFlash.current = Math.max(0, skillFlash.current - dt);

      // ── Render ──
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#07070f'; ctx.fillRect(0, 0, W, H);
      drawFloor();
      drawEntrance(t);
      drawExits(t);
      drawPickups(t);
      drawMonsters(t);
      drawPlayer(t);
      drawHeroHpBar();
      drawJoystick();
      drawButtons();

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('touchstart', noScroll);
      canvas.removeEventListener('touchmove',  noScroll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedition?.room.id, doCollect, doExit, doHeroDefeated]);

  // ─── Touch handlers ────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scX = canvas.width / rect.width, scY = canvas.height / rect.height;
    const CW = canvas.width, CH = canvas.height;
    for (const touch of Array.from(e.changedTouches)) {
      const cx = (touch.clientX - rect.left) * scX;
      const cy = (touch.clientY - rect.top)  * scY;
      if (Math.hypot(cx - (CW - 65), cy - (CH - 80))  < 46) {
        interactHeld.current = true; interactTid.current = touch.identifier; continue;
      }
      if (Math.hypot(cx - (CW - 65), cy - (CH - 170)) < 46) {
        triggerSkill(); skillTid.current = touch.identifier; continue;
      }
      if (cx < CW * 0.6 && cy > CH * 0.45) {
        joyRef.current = { active: true, baseX: cx, baseY: cy, dx: 0, dy: 0, tid: touch.identifier };
      }
    }
  }, [triggerSkill]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const joy = joyRef.current; if (!joy.active) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const scX = canvas.width / rect.width, scY = canvas.height / rect.height;
    const touch = Array.from(e.touches).find(tt => tt.identifier === joy.tid); if (!touch) return;
    const cx = (touch.clientX - rect.left) * scX, cy = (touch.clientY - rect.top) * scY;
    const rdx = cx - joy.baseX, rdy = cy - joy.baseY, d = Math.hypot(rdx, rdy);
    joy.dx = d > 0 ? rdx / Math.max(d, 52) : 0;
    joy.dy = d > 0 ? rdy / Math.max(d, 52) : 0;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === joyRef.current.tid)
        joyRef.current = { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, tid: -1 };
      if (touch.identifier === interactTid.current) {
        interactHeld.current = false; interactTid.current = -1; interactProg.current = 0;
      }
      if (touch.identifier === skillTid.current) skillTid.current = -1;
    }
  }, []);

  if (!expedition) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: '#8888aa' }}>No active expedition.</p>
        <button
          onClick={() => setScreen('base')}
          style={{ background: '#2a2a40', border: 'none', color: '#ccd6f6', padding: '10px 16px', borderRadius: 8, cursor: 'pointer' }}
        >← Back to Base</button>
      </div>
    );
  }

  const W = Math.min(480, window.innerWidth);
  const H = Math.floor(window.innerHeight * 0.88);
  const loot = Object.entries(expedition.pendingLoot).filter(([, v]) => (v ?? 0) > 0);

  return (
    <div style={{ position: 'relative', width: W, margin: '0 auto', overflow: 'hidden', background: '#07070f' }}>
      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ display: 'block', touchAction: 'none' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}     onTouchCancel={onTouchEnd}
      />
      <div style={ui.topBar}>
        <span style={ui.depth}>Room {expedition.depth + 1} / {expedition.maxDepth}</span>
        {loot.length > 0 && (
          <span style={ui.loot}>💰 {loot.map(([k, v]) => `${RES_ICON[k]}${v}`).join(' ')}</span>
        )}
      </div>
      {expedition.room.isFinal && (
        <div style={ui.finalHint}>🚪 Both doors lead to extraction — secure your loot!</div>
      )}
      {error && <div style={ui.error}>{error}</div>}
    </div>
  );
}

const ui: Record<string, React.CSSProperties> = {
  topBar: {
    position: 'absolute', top: 8, left: 8, right: 8,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    pointerEvents: 'none',
  },
  depth: {
    background: 'rgba(15,15,35,0.85)', border: '1px solid #3a3a50',
    borderRadius: 8, padding: '4px 10px', color: '#c9b0ff', fontSize: 12, fontWeight: 700,
  },
  loot: {
    background: 'rgba(15,15,35,0.85)', border: '1px solid #3a3a50',
    borderRadius: 8, padding: '4px 10px', color: '#facc15', fontSize: 12,
  },
  finalHint: {
    position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(20,83,45,0.9)', border: '1px solid #4ade80', borderRadius: 8,
    padding: '5px 12px', color: '#4ade80', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  error: {
    position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8,
    padding: '6px 14px', color: '#f87171', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
  },
};
