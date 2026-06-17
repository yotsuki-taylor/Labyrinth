import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { engine } from '../game/engine.js';
import { haptics } from '../game/haptics.js';
import { HERO_TEMPLATES } from '@labyrinth/shared';
import type { ExpeditionDTO, RoomType, HeroStats, ResourceType } from '@labyrinth/shared';

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

// ── Particle system ────────────────────────────────────────────────────────
interface Particle {
  sx: number; sy: number; // screen-space position (px)
  vx: number; vy: number; // velocity (px/s)
  life: number;           // 0→1 remaining life (1 = just spawned)
  decay: number;          // lifetime lost per second
  r: number;              // dot radius (0 = text particle)
  rgb: string;            // e.g. '255,120,50'
  text?: string;          // floating damage number
}

// ── Boss types ─────────────────────────────────────────────────────────────
interface BossAOE {
  id: string;
  type: 'slam' | 'ring';
  startAt: number;    // performance.now() when telegraphed
  warmupMs: number;   // ms of telegraph
  fired: boolean;     // damage applied
  cx: number; cy: number; // world-space target (slam: player pos, ring: boss pos)
  r: number;          // tile-space radius at detonation
}

interface Boss {
  hp: number; maxHp: number;
  x: number; y: number;
  attack: number;
  speed: number;
  aggroRange: number;
  aggro: boolean;
  lastBasicAt: number;
  dead: boolean; deadAt: number;
  hitFlash: number;
  phase: 1 | 2;
  nextAoeAt: number;
  aoes: BossAOE[];
}

// Spawn counts per room type: [min, max]
const MONSTER_COUNTS: Record<string, [number, number]> = {
  start: [0, 0], empty: [0, 1], loot: [1, 3], treasure: [2, 4], boss: [0, 0],
};
const MONSTER_POOL: Record<string, MonsterType[]> = {
  start: [], empty: ['skeleton'], loot: ['skeleton', 'wolf'],
  treasure: ['skeleton', 'wolf', 'golem'], boss: [],
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
  // Keep aggro circles from overlapping, so the player can only be inside
  // one monster's aggro range at a time (no multi-pulls).
  for (let i = 0; i < count * 60 && out.length < count; i++) {
    const x = ri(2, width - 3);
    const y = ri(2, height - 5);
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    const mType = pool[Math.floor(Math.random() * pool.length)];
    const base = MONSTER_BASE[mType];
    const tooClose = out.some((o) => Math.hypot(o.x - x, o.y - y) < o.aggroRange + base.aggroRange);
    if (tooClose) continue;
    used.add(key);
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
  if (type === 'boss') return '👹';
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
  // Boss
  const bossRef        = useRef<Boss | null>(null);
  const nearBossRef    = useRef(false);
  // Interact (collect)
  const nearPickupRef  = useRef<string | null>(null);
  const interactHeld   = useRef(false);
  const interactTid    = useRef(-1);
  const interactProg   = useRef(0);
  // Skill
  const skillCool      = useRef(0);
  const skillFlash     = useRef(0);
  const skillTid       = useRef(-1);
  // Skill tooltip (long-press on mobile, hover on desktop)
  const [skillTooltip, setSkillTooltip] = useState(false);
  const [bossDefeated, setBossDefeated] = useState(false);
  const skillLongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skillLongFired = useRef(false);
  // Particle system
  const particlesRef        = useRef<Particle[]>([]);
  const spawnParticlesFnRef = useRef<(wx: number, wy: number, rgb: string, dmg?: number) => void>(() => {});
  // Camera shake — current intensity in screen pixels, decays to 0 each frame
  const shakeRef            = useRef(0);
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
    nearBossRef.current   = false;
    attackCoolRef.current = 0;
    monstersRef.current    = spawnMonsters(expedition.room);
    particlesRef.current   = [];
    shakeRef.current       = 0;
    setBossDefeated(false);

    // Init boss if this is a boss room
    if (expedition.room.type === 'boss') {
      const sc = 1 + expedition.depth * 0.12;
      bossRef.current = {
        hp: Math.round(450 * sc), maxHp: Math.round(450 * sc),
        x: expedition.room.width / 2, y: 3,
        attack: Math.round(22 * sc),
        speed: 0.55,
        aggroRange: 12,
        aggro: false,
        lastBasicAt: 0,
        dead: false, deadAt: 0,
        hitFlash: 0,
        phase: 1,
        nextAoeAt: performance.now() + 4000,
        aoes: [],
      };
    } else {
      bossRef.current = null;
    }

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
      // Hit regular monsters
      for (const m of monstersRef.current) {
        if (m.dead) continue;
        const dist = Math.hypot(p.x - m.x, p.y - m.y);
        const inRange = radius === 0 ? dist < ATTACK_R : dist < radius;
        if (inRange) {
          m.hp -= dmg;
          m.hitFlash = 1;
          spawnParticlesFnRef.current(m.x, m.y, '210,160,255', dmg);
          shakeRef.current = Math.max(shakeRef.current, 5);
          haptics.medium();
          if (m.hp <= 0) { m.dead = true; m.deadAt = performance.now(); }
        }
      }
      // Hit boss if in range
      const boss = bossRef.current;
      if (boss && !boss.dead) {
        const dist = Math.hypot(p.x - boss.x, p.y - boss.y);
        const inRange = radius === 0 ? dist < ATTACK_R : dist < radius;
        if (inRange) {
          boss.hp = Math.max(0, boss.hp - dmg);
          boss.hitFlash = 1;
          spawnParticlesFnRef.current(boss.x, boss.y, '210,160,255', dmg);
          shakeRef.current = Math.max(shakeRef.current, 5);
          haptics.medium();
          if (boss.hp <= 0) {
            boss.dead = true;
            boss.deadAt = performance.now();
            nearBossRef.current = false;
            shakeRef.current = 20;
            haptics.success();
            spawnBossLoot(boss.x, boss.y);
          }
        }
      }
    }
    if (heal > 0) {
      heroHpRef.current = Math.min(heroMaxHpRef.current, heroHpRef.current + heal);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    haptics.select();
    void collectPickup(id);
  }, [collectPickup]);

  const doExit = useCallback((id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    haptics.light();
    engine.syncHeroHp(heroHpRef.current);
    void enterExit(id);
  }, [enterExit]);

  const doHeroDefeated = useCallback(() => {
    if (defeatedRef.current) return;
    defeatedRef.current = true;
    busyRef.current = true;
    void heroDefeated();
  }, [heroDefeated]);

  // Drops boss loot onto the floor after kill and injects it into the engine.
  const spawnBossLoot = useCallback((bx: number, by: number) => {
    const exp = expRef.current;
    if (!exp) return;
    const t = Date.now();
    const drops: Array<{ id: string; resource: ResourceType; amount: number; x: number; y: number }> = [
      { id: `bd0_${t}`, resource: 'relics',  amount: ri(2, 4),    x: bx,       y: by + 1   },
      { id: `bd1_${t}`, resource: 'essence', amount: ri(6, 12),   x: bx - 1.5, y: by + 0.5 },
      { id: `bd2_${t}`, resource: 'gold',    amount: ri(80, 150), x: bx + 1.5, y: by + 0.5 },
      { id: `bd3_${t}`, resource: 'iron',    amount: ri(20, 40),  x: bx,       y: by + 2   },
    ];
    engine.addBossDrops(drops);
    for (const d of drops) exp.room.pickups.push({ ...d, collected: false });
    setBossDefeated(true);
  }, []);

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

    spawnParticlesFnRef.current = (wx, wy, rgb, dmg) => {
      const { sx, sy } = toScreen(wx, wy);
      const footY = sy + TH / 2;
      const count = 7;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 90;
        particlesRef.current.push({
          sx: sx + (Math.random() - 0.5) * TW * 0.18,
          sy: footY - TH * 0.25 + (Math.random() - 0.5) * TH * 0.25,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.45 - 65,
          life: 1,
          decay: 1.5 + Math.random() * 1.0,
          r: 2.5 + Math.random() * 3.5,
          rgb,
        });
      }
      if (dmg !== undefined) {
        particlesRef.current.push({
          sx: sx + (Math.random() - 0.5) * 14,
          sy: footY - TH * 0.6,
          vx: (Math.random() - 0.5) * 18,
          vy: -95,
          life: 1,
          decay: 1.05,
          r: 0,
          rgb,
          text: `-${dmg}`,
        });
      }
    };

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

    function drawPit(sx: number, sy: number) {
      const pg = ctx.createRadialGradient(sx, sy + TH / 2, 2, sx, sy + TH / 2, TW / 2);
      pg.addColorStop(0, '#000000'); pg.addColorStop(1, '#0a0a10');
      drawDiamond(sx, sy, TW * 0.98, TH * 0.98, pg, '#000000');
    }

    function drawFloor() {
      for (let sum = 0; sum <= (RW - 1) + (RH - 1); sum++) {
        for (let col = 0; col < RW; col++) {
          const row = sum - col;
          if (row < 0 || row >= RH) continue;
          const { sx, sy } = toScreen(col, row);
          if (sx < -TW || sx > W + TW || sy < -TH * 2 || sy > H + TH * 2) continue;

          if (wallSet.has(`${col},${row}`)) {
            drawPit(sx, sy);
          } else {
            const g = ctx.createLinearGradient(sx, sy, sx, sy + TH);
            g.addColorStop(0, '#3c3c5a'); g.addColorStop(0.6, '#2a2a42'); g.addColorStop(1, '#191929');
            drawDiamond(sx, sy, TW * 0.98, TH * 0.98, g, '#20203a');
          }
        }
      }
    }

    function drawBossAOEs() {
      const boss = bossRef.current;
      if (!boss || boss.dead) return;
      const now = performance.now();
      for (const aoe of boss.aoes) {
        const elapsed = now - aoe.startAt;
        const prog = Math.min(1, elapsed / aoe.warmupMs);
        const alpha = aoe.fired ? 0 : 0.25 + 0.2 * Math.sin(prog * Math.PI * 6);
        if (aoe.type === 'slam') {
          const { sx: asx, sy: asy } = toScreen(aoe.cx, aoe.cy);
          const rPx = aoe.r * (TW / 2);
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(asx, asy + TH / 2, rPx, rPx * (TH / TW), 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(239,68,68,${alpha * 0.4})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(255,80,80,${alpha + 0.3})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        } else {
          // ring: radius expands from 0 to aoe.r over warmup
          const curR = aoe.r * prog;
          const { sx: bsx, sy: bsy } = toScreen(aoe.cx, aoe.cy);
          const rPx = curR * (TW / 2);
          const thickness = 18;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(bsx, bsy + TH / 2, rPx + thickness, (rPx + thickness) * (TH / TW), 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,100,0,${alpha * 0.18})`;
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(bsx, bsy + TH / 2, rPx + thickness, (rPx + thickness) * (TH / TW), 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,120,0,${alpha + 0.25})`;
          ctx.lineWidth = 3;
          ctx.stroke();
          if (rPx > thickness) {
            ctx.beginPath();
            ctx.ellipse(bsx, bsy + TH / 2, rPx - thickness, (rPx - thickness) * (TH / TW), 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,120,0,${(alpha + 0.25) * 0.5})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    function drawBoss(t: number) {
      const boss = bossRef.current;
      if (!boss) return;
      if (boss.dead) {
        const elapsed = performance.now() - boss.deadAt;
        if (elapsed > 2500) return;
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 1500);
      }
      const { sx, sy } = toScreen(boss.x, boss.y);
      const footY = sy + TH / 2;
      const r = TW * 0.46;

      // Floor shadow
      ctx.beginPath();
      ctx.ellipse(sx, footY, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();

      // Aura
      const glowR = r + 8 + 4 * Math.sin(t * 3);
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR + 12);
      const flashA = boss.hitFlash * 0.5;
      grd.addColorStop(0, `rgba(239,68,68,${0.45 + flashA})`);
      grd.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.beginPath(); ctx.arc(sx, sy, glowR + 12, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();

      // Icon
      if (boss.hitFlash > 0) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 24; }
      ctx.font = `${Math.round(r * 1.9)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👹', sx, sy - r * 0.15);
      ctx.shadowBlur = 0;

      // Phase 2 label
      if (boss.phase === 2) {
        ctx.font = '700 11px sans-serif';
        ctx.fillStyle = '#f97316';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚡ ENRAGED', sx, sy - r * 1.8);
      }

      // HP bar above boss
      const bw = r * 3.5, bh = 7, bx = sx - bw / 2, bbarY = sy - r * 1.3;
      ctx.fillStyle = '#1a0a0a'; ctx.fillRect(bx, bbarY, bw, bh);
      const ratio = boss.hp / boss.maxHp;
      ctx.fillStyle = ratio > 0.5 ? '#ef4444' : ratio > 0.25 ? '#f97316' : '#dc2626';
      ctx.fillRect(bx, bbarY, bw * ratio, bh);

      ctx.globalAlpha = 1;
    }

    function drawBossHpBar() {
      const boss = bossRef.current;
      if (!boss || boss.dead) return;
      const ratio = boss.hp / boss.maxHp;
      const bw = Math.min(W - 48, 300), bh = 10, cx = W / 2, by = 34;
      ctx.fillStyle = 'rgba(10,8,20,0.88)';
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2 - 14, by - bh / 2 - 12, bw + 28, bh + 28, 8);
      ctx.fill();
      ctx.font = '700 11px sans-serif';
      ctx.fillStyle = '#f87171'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👹  LABYRINTH KEEPER', cx, by - 6);
      ctx.fillStyle = '#1a0a0a'; ctx.fillRect(cx - bw / 2, by + 2, bw, bh);
      const barColor = ratio > 0.5 ? '#ef4444' : ratio > 0.25 ? '#f97316' : '#dc2626';
      ctx.fillStyle = barColor;
      ctx.fillRect(cx - bw / 2, by + 2, bw * ratio, bh);
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

    function drawParticles(dt: number) {
      const pts = particlesRef.current;
      ctx.save();
      for (let i = pts.length - 1; i >= 0; i--) {
        const pt = pts[i];
        pt.life -= pt.decay * dt;
        if (pt.life <= 0) { pts.splice(i, 1); continue; }
        pt.sx += pt.vx * dt;
        pt.sy += pt.vy * dt;
        pt.vy += 140 * dt; // gravity
        const alpha = Math.min(1, pt.life * 1.5);
        if (pt.text) {
          const sz = Math.round(11 + 6 * (1 - pt.life));
          ctx.font = `700 ${sz}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = `rgba(${pt.rgb},${alpha.toFixed(2)})`;
          ctx.strokeStyle = `rgba(0,0,0,${(alpha * 0.6).toFixed(2)})`;
          ctx.lineWidth = 2.5;
          ctx.strokeText(pt.text, pt.sx, pt.sy);
          ctx.fillText(pt.text, pt.sx, pt.sy);
        } else {
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, Math.max(0.5, pt.r * pt.life), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${pt.rgb},${alpha.toFixed(2)})`;
          ctx.fill();
        }
      }
      ctx.restore();
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
      const nearBoss = nearBossRef.current;
      const pickup  = nearPickupRef.current;
      const atkCool = attackCoolRef.current;

      // Interact / Attack button
      if (enemy !== null || nearBoss) {
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

        // Boss counts as near-enemy if alive and close
        const bossCheck = bossRef.current;
        nearBossRef.current = !!(
          bossCheck && !bossCheck.dead &&
          nearest === null &&
          Math.hypot(p.x - bossCheck.x, p.y - bossCheck.y) < ATTACK_R
        );

        // ── Near-pickup detection ──
        let nearPk: string | null = null;
        let nearPkDist = PICKUP_R;
        for (const pk of exp.room.pickups) {
          if (pk.collected || collectedRef.current.has(pk.id)) continue;
          const d = Math.hypot(p.x - pk.x, p.y - pk.y);
          if (d < nearPkDist) { nearPkDist = d; nearPk = pk.id; }
        }
        nearPickupRef.current = (nearest !== null || nearBossRef.current) ? null : nearPk; // enemy has priority

        // ── Interact button action ──
        attackCoolRef.current = Math.max(0, attackCoolRef.current - dt);
        if (interactHeld.current) {
          if (nearest !== null && attackCoolRef.current <= 0) {
            // Attack monster
            attackCoolRef.current = ATTACK_CD;
            const dmg = Math.max(1, Math.round(heroStatsRef.current.attack * (0.9 + Math.random() * 0.2)));
            nearest.hp -= dmg;
            nearest.hitFlash = 1;
            spawnParticlesFnRef.current(nearest.x, nearest.y, '255,120,50', dmg);
            shakeRef.current = Math.max(shakeRef.current, 3);
            haptics.light();
            if (nearest.hp <= 0) {
              nearest.dead = true;
              nearest.deadAt = performance.now();
              nearEnemyRef.current = null;
            }
          } else if (nearBossRef.current && bossRef.current && !bossRef.current.dead && attackCoolRef.current <= 0) {
            // Attack boss
            attackCoolRef.current = ATTACK_CD;
            const stats = heroStatsRef.current;
            const dmg = Math.max(1, Math.round(stats.attack * (0.9 + Math.random() * 0.2)));
            bossRef.current.hp = Math.max(0, bossRef.current.hp - dmg);
            bossRef.current.hitFlash = 1;
            spawnParticlesFnRef.current(bossRef.current.x, bossRef.current.y, '255,120,50', dmg);
            shakeRef.current = Math.max(shakeRef.current, 3);
            haptics.light();
            if (bossRef.current.hp <= 0) {
              bossRef.current.dead = true;
              bossRef.current.deadAt = performance.now();
              nearBossRef.current = false;
              shakeRef.current = 20;
              haptics.success();
              spawnBossLoot(bossRef.current.x, bossRef.current.y);
            }
          } else if (nearest === null && !nearBossRef.current && nearPk !== null) {
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
            const dmgTaken = m.attack;
            heroHpRef.current = Math.max(0, heroHpRef.current - dmgTaken);
            spawnParticlesFnRef.current(p.x, p.y, '239,68,68', dmgTaken);
            shakeRef.current = Math.max(shakeRef.current, 8);
            if (heroHpRef.current <= 0) { haptics.error(); doHeroDefeated(); }
            else haptics.heavy();
          }
        }

        // ── Boss AI ──
        const boss = bossRef.current;
        if (boss && !boss.dead && (boss.aggro || Math.hypot(p.x - boss.x, p.y - boss.y) < boss.aggroRange)) {
          if (!boss.aggro) boss.aggro = true;
          boss.hitFlash = Math.max(0, boss.hitFlash - dt * 6);
          const bossNow = performance.now();
          const dist = Math.hypot(p.x - boss.x, p.y - boss.y);

          // Phase check
          if (boss.hp < boss.maxHp * 0.5 && boss.phase === 1) boss.phase = 2;

          // Move toward player (stop if casting)
          const isCasting = boss.aoes.some(a => !a.fired);
          if (!isCasting && dist > 1.1) {
            const nx = boss.x + (p.x - boss.x) / dist * boss.speed * dt;
            const ny = boss.y + (p.y - boss.y) / dist * boss.speed * dt;
            if (!playerBlocked(nx, boss.y)) boss.x = nx;
            if (!playerBlocked(boss.x, ny)) boss.y = ny;
          }

          // Basic melee attack
          if (dist < 1.2 && bossNow - boss.lastBasicAt > (boss.phase === 2 ? 1100 : 1500)) {
            boss.lastBasicAt = bossNow;
            const dmg = Math.round(boss.attack * (0.85 + Math.random() * 0.3));
            heroHpRef.current = Math.max(0, heroHpRef.current - dmg);
            spawnParticlesFnRef.current(boss.x, boss.y, '239,68,68', dmg);
            shakeRef.current = Math.max(shakeRef.current, 7);
            if (heroHpRef.current <= 0) { haptics.error(); doHeroDefeated(); }
            else haptics.heavy();
          }

          // AOE ability
          if (!isCasting && bossNow >= boss.nextAoeAt) {
            const aoeType: 'slam' | 'ring' = Math.random() < 0.55 ? 'slam' : 'ring';
            const warmupMs = aoeType === 'slam' ? 1700 : 1400;
            if (aoeType === 'slam') {
              const count = boss.phase === 2 ? 2 : 1;
              for (let i = 0; i < count; i++) {
                const cx2 = i === 0 ? p.x : p.x + (Math.random() - 0.5) * 3;
                const cy2 = i === 0 ? p.y : p.y + (Math.random() - 0.5) * 3;
                boss.aoes.push({ id: `aoe_${bossNow}_${i}`, type: 'slam', startAt: bossNow, warmupMs, fired: false, cx: cx2, cy: cy2, r: 2.2 });
              }
            } else {
              boss.aoes.push({ id: `aoe_${bossNow}`, type: 'ring', startAt: bossNow, warmupMs, fired: false, cx: boss.x, cy: boss.y, r: 4.5 });
            }
            const cd = boss.phase === 2 ? 2800 : 4500;
            boss.nextAoeAt = bossNow + warmupMs + cd;
          }

          // Process AOE damage
          for (const aoe of boss.aoes) {
            if (aoe.fired) continue;
            const elapsed = performance.now() - aoe.startAt;
            if (elapsed < aoe.warmupMs) continue;
            aoe.fired = true;
            if (aoe.type === 'slam') {
              const d = Math.hypot(p.x - aoe.cx, p.y - aoe.cy);
              if (d < aoe.r) {
                const dmg = Math.round(boss.attack * 1.5);
                heroHpRef.current = Math.max(0, heroHpRef.current - dmg);
                spawnParticlesFnRef.current(p.x, p.y, '239,68,68', dmg);
                shakeRef.current = Math.max(shakeRef.current, 12);
                if (heroHpRef.current <= 0) { haptics.error(); doHeroDefeated(); }
                else haptics.heavy();
              }
            } else {
              const d = Math.hypot(p.x - aoe.cx, p.y - aoe.cy);
              if (d > 1.2 && d < aoe.r) {
                const dmg = Math.round(boss.attack * 1.35);
                heroHpRef.current = Math.max(0, heroHpRef.current - dmg);
                spawnParticlesFnRef.current(p.x, p.y, '239,68,68', dmg);
                shakeRef.current = Math.max(shakeRef.current, 10);
                if (heroHpRef.current <= 0) { haptics.error(); doHeroDefeated(); }
                else haptics.heavy();
              }
            }
          }
          // Expire old AOEs
          boss.aoes = boss.aoes.filter(a => {
            const age = performance.now() - a.startAt;
            return age < a.warmupMs + 800;
          });
        }

        // ── Exit triggers — blocked in boss room while boss is alive ──
        const bossAlive = bossRef.current && !bossRef.current.dead;
        if (!bossAlive || exp.room.type !== 'boss') {
          for (const ex of exp.room.exits) {
            const ep = exitPos(ex.side);
            if (Math.hypot(p.x - ep.x, p.y - ep.y) < EXIT_R) { doExit(ex.id); break; }
          }
        }
      }

      // Cooldowns
      skillCool.current  = Math.max(0, skillCool.current  - dt);
      skillFlash.current = Math.max(0, skillFlash.current - dt);

      // ── Render ──
      // Decay and sample camera shake
      shakeRef.current = Math.max(0, shakeRef.current - dt * 24);
      const sk = shakeRef.current;
      const shakeX = sk > 0.3 ? (Math.random() - 0.5) * 2 * sk : 0;
      const shakeY = sk > 0.3 ? (Math.random() - 0.5) * sk : 0;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#07070f'; ctx.fillRect(0, 0, W, H);

      // World (shakes)
      ctx.save();
      ctx.translate(shakeX, shakeY);
      drawFloor();
      drawBossAOEs();
      drawEntrance(t);
      drawExits(t);
      drawPickups(t);
      drawBoss(t);
      drawMonsters(t);
      drawPlayer(t);
      drawParticles(dt);
      ctx.restore();

      // UI (stable)
      drawHeroHpBar();
      drawBossHpBar();
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
        skillTid.current = touch.identifier;
        skillLongFired.current = false;
        if (skillLongTimer.current !== null) clearTimeout(skillLongTimer.current);
        skillLongTimer.current = setTimeout(() => {
          skillLongFired.current = true;
          setSkillTooltip(true);
        }, 450);
        continue;
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
      if (touch.identifier === skillTid.current) {
        skillTid.current = -1;
        if (skillLongTimer.current !== null) { clearTimeout(skillLongTimer.current); skillLongTimer.current = null; }
        if (!skillLongFired.current) triggerSkill();
        else setSkillTooltip(false);
        skillLongFired.current = false;
      }
    }
  }, [triggerSkill]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scX = canvas.width / rect.width, scY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scX;
    const cy = (e.clientY - rect.top)  * scY;
    setSkillTooltip(Math.hypot(cx - (canvas.width - 65), cy - (canvas.height - 170)) < 46);
  }, []);

  const onMouseLeave = useCallback(() => setSkillTooltip(false), []);

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
        onMouseMove={onMouseMove}   onMouseLeave={onMouseLeave}
      />
      <div style={ui.topBar}>
        <span style={ui.depth}>Room {expedition.depth + 1} / {expedition.maxDepth}</span>
        {loot.length > 0 && (
          <span style={ui.loot}>💰 {loot.map(([k, v]) => `${RES_ICON[k]}${v}`).join(' ')}</span>
        )}
      </div>
      {expedition.room.isFinal && (
        <div style={ui.finalHint}>
          {expedition.room.type === 'boss'
            ? (bossDefeated ? '🚪 Collect the loot and exit!' : '👹 Defeat the Labyrinth Keeper to extract!')
            : '🚪 Exit to extract!'}
        </div>
      )}
      {error && <div style={ui.error}>{error}</div>}
      {skillTooltip && heroClass && (
        <div style={ui.skillTooltip}>
          <div style={ui.skillTooltipTitle}>
            {SKILL_ICON[heroClass]} {HERO_TEMPLATES[heroClass].label} — Skill
          </div>
          <div style={ui.skillTooltipBody}>{HERO_TEMPLATES[heroClass].ability}</div>
          <div style={ui.skillTooltipCd}>Cooldown: {SKILL_CD}s</div>
        </div>
      )}
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
    background: 'rgba(83,20,20,0.9)', border: '1px solid #ef4444', borderRadius: 8,
    padding: '5px 12px', color: '#f87171', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  error: {
    position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8,
    padding: '6px 14px', color: '#f87171', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  skillTooltip: {
    position: 'absolute', right: 10, bottom: 218,
    maxWidth: 190,
    background: 'rgba(10,8,24,0.96)', border: '1px solid #5b3a9c',
    borderRadius: 10, padding: '10px 12px', pointerEvents: 'none',
    boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
  },
  skillTooltipTitle: {
    color: '#c9b0ff', fontWeight: 700, fontSize: 12, marginBottom: 5,
  },
  skillTooltipBody: {
    color: '#b0a0d0', fontSize: 11, lineHeight: 1.45, fontStyle: 'italic', marginBottom: 5,
  },
  skillTooltipCd: {
    color: '#6a5a80', fontSize: 10,
  },
};
