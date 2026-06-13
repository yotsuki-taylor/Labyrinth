import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore.js';
import type { ExpeditionDTO, RoomType } from '@labyrinth/shared';

const SPEED = 3.4;            // tiles per second
const PLAYER_R = 0.30;        // collision radius
const PICKUP_R = 0.65;        // collect radius
const EXIT_R = 0.85;          // exit trigger radius

const RES_ICON: Record<string, string> = {
  gold: '🪙', stone: '🪨', iron: '⚙️', essence: '✨', relics: '🔮',
};

function roomPreviewIcon(type: RoomType, isExtract: boolean): string {
  if (isExtract) return '🚪';
  if (type === 'loot') return '💰';
  if (type === 'treasure') return '💎';
  return '·';
}

export function LabyrinthRunScreen() {
  const { expedition, heroes, collectPickup, enterExit, setScreen, error } = useGameStore();

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const playerRef    = useRef({ x: 0, y: 0 });
  const joyRef       = useRef({ active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, tid: -1 });
  const keysRef      = useRef(new Set<string>());
  const expRef       = useRef<ExpeditionDTO | null>(expedition);
  const collectedRef = useRef(new Set<string>());
  const busyRef      = useRef(false);
  const rafRef       = useRef(0);
  const lastTRef     = useRef(0);
  const heroImgRef    = useRef<HTMLImageElement | null>(null);
  const heroLoadedRef = useRef(false);
  const cameraRef     = useRef({ x: 0, y: 0 });

  // Keep a live ref to the expedition for the rAF loop.
  useEffect(() => { expRef.current = expedition; }, [expedition]);

  // Resolve the hero's class → load portrait for the player token.
  const heroClass = expedition
    ? heroes.find((h) => h.id === expedition.heroId)?.class
    : undefined;

  useEffect(() => {
    if (!heroClass) return;
    const img = new Image();
    heroLoadedRef.current = false;
    img.onload = () => { heroLoadedRef.current = true; };
    img.src = `${import.meta.env.BASE_URL}heroes/${heroClass}.png`;
    heroImgRef.current = img;
  }, [heroClass]);

  // Reset player to the entrance whenever a new room loads.
  useEffect(() => {
    if (!expedition) return;
    const { width, height } = expedition.room;
    playerRef.current = { x: (width - 1) / 2, y: height - 1 };
    cameraRef.current = { x: (width - 1) / 2, y: height - 1 };
    collectedRef.current = new Set(
      expedition.room.pickups.filter((p) => p.collected).map((p) => p.id),
    );
    busyRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedition?.room.id]);

  // Keyboard controls.
  useEffect(() => {
    const dn = (e: KeyboardEvent) => keysRef.current.add(e.key);
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  const doCollect = useCallback((id: string) => {
    if (collectedRef.current.has(id)) return;
    collectedRef.current.add(id);
    void collectPickup(id);
  }, [collectPickup]);

  const doExit = useCallback((id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    void enterExit(id);
  }, [enterExit]);

  // ─── Render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !expedition) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    const { width: RW, height: RH } = expedition.room;

    // Large fixed tile size — camera follows the player (no full-room fit).
    const TW = 180;
    const TH = TW / 2;

    function toScreen(tx: number, ty: number) {
      const cam = cameraRef.current;
      return {
        sx: (tx - ty - (cam.x - cam.y)) * (TW / 2) + W / 2,
        sy: (tx + ty - (cam.x + cam.y)) * (TH / 2) + H * 0.55,
      };
    }

    const inRoom = (x: number, y: number) =>
      x >= 0 && x <= RW - 1 && y >= 0 && y <= RH - 1;

    // Exit world positions (top-left & top-right, just past the back wall).
    function exitPos(side: 'left' | 'right') {
      return { x: side === 'left' ? RW * 0.24 : RW * 0.76, y: -0.15 };
    }
    const entrancePos = { x: (RW - 1) / 2, y: RH - 0.85 };

    const noScroll = (e: TouchEvent) => e.preventDefault();
    canvas.addEventListener('touchstart', noScroll, { passive: false });
    canvas.addEventListener('touchmove', noScroll, { passive: false });

    function drawDiamond(sx: number, sy: number, tw: number, th: number, fill: string | CanvasGradient, stroke?: string) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tw / 2, sy + th / 2);
      ctx.lineTo(sx, sy + th);
      ctx.lineTo(sx - tw / 2, sy + th / 2);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }

    function drawFloor() {
      for (let sum = 0; sum <= (RW - 1) + (RH - 1); sum++) {
        for (let col = 0; col < RW; col++) {
          const row = sum - col;
          if (row < 0 || row >= RH) continue;
          const { sx, sy } = toScreen(col, row);
          if (sx < -TW || sx > W + TW || sy < -TH * 2 || sy > H + TH * 2) continue;
          const g = ctx.createLinearGradient(sx, sy, sx, sy + TH);
          g.addColorStop(0, '#3c3c5a');
          g.addColorStop(0.6, '#2a2a42');
          g.addColorStop(1, '#191929');
          drawDiamond(sx, sy, TW * 0.98, TH * 0.98, g, '#20203a');
        }
      }
    }

    function drawEntrance(t: number) {
      const { sx, sy } = toScreen(entrancePos.x, entrancePos.y);
      ctx.globalAlpha = 0.5 + 0.15 * Math.sin(t * 2);
      ctx.font = `${Math.round(TW * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⛩️', sx, sy);
      ctx.globalAlpha = 1;
    }

    function drawExits(t: number) {
      const exp = expRef.current;
      if (!exp) return;
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.6);
      for (const ex of exp.room.exits) {
        const p = exitPos(ex.side);
        const { sx, sy } = toScreen(p.x, p.y);
        const color = ex.isExtract ? '#4ade80' : ex.leadsTo === 'treasure' ? '#facc15' : ex.leadsTo === 'loot' ? '#c9b0ff' : '#7a8cff';

        // Glow halo
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, TW * 0.9 * pulse);
        grd.addColorStop(0, color + '66');
        grd.addColorStop(1, color + '00');
        ctx.beginPath();
        ctx.arc(sx, sy, TW * 0.9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Doorway arch
        ctx.font = `${Math.round(TW * 0.85)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🚪', sx, sy);

        // Preview icon above the door
        ctx.font = `${Math.round(TW * 0.5)}px sans-serif`;
        ctx.fillText(roomPreviewIcon(ex.leadsTo, ex.isExtract), sx, sy - TW * 0.7);

        // Label
        ctx.font = '700 11px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(ex.isExtract ? 'EXTRACT' : ex.leadsTo.toUpperCase(), sx, sy + TW * 0.55);
      }
    }

    function drawPickups(t: number) {
      const exp = expRef.current;
      if (!exp) return;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const pk of exp.room.pickups) {
        if (pk.collected || collectedRef.current.has(pk.id)) continue;
        const bob = Math.sin(t * 3 + pk.x + pk.y) * (TH * 0.12);
        const { sx, sy } = toScreen(pk.x, pk.y);

        // Soft shadow on the floor
        ctx.beginPath();
        ctx.ellipse(sx, sy + TH * 0.1, TW * 0.18, TH * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();

        // Glow
        const grd = ctx.createRadialGradient(sx, sy - 6 + bob, 0, sx, sy - 6 + bob, TW * 0.34);
        grd.addColorStop(0, 'rgba(250,204,21,0.45)');
        grd.addColorStop(1, 'rgba(250,204,21,0)');
        ctx.beginPath();
        ctx.arc(sx, sy - 6 + bob, TW * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.font = `${Math.round(TW * 0.5)}px sans-serif`;
        ctx.fillText(RES_ICON[pk.resource] ?? '💰', sx, sy - 6 + bob);
      }
    }

    function drawPlayer(t: number) {
      const p = playerRef.current;
      const { sx, sy } = toScreen(p.x, p.y);
      const r = Math.max(11, TW * 0.32);

      // Shadow
      ctx.beginPath();
      ctx.ellipse(sx, sy + r * 0.5, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      // Aura
      const glow = r + 4 + 2 * Math.sin(t * 4);
      const grd = ctx.createRadialGradient(sx, sy - r, 0, sx, sy - r, glow + 8);
      grd.addColorStop(0, 'rgba(201,176,255,0.6)');
      grd.addColorStop(1, 'rgba(201,176,255,0)');
      ctx.beginPath();
      ctx.arc(sx, sy - r, glow + 8, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Portrait clipped into a circle (or fallback token)
      const img = heroImgRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy - r, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (img && heroLoadedRef.current) {
        ctx.drawImage(img, sx - r, sy - r - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = '#c9b0ff';
        ctx.fillRect(sx - r, sy - r - r, r * 2, r * 2);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(sx, sy - r, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#e8d8ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function drawJoystick() {
      const joy = joyRef.current;
      if (joy.active) {
        ctx.beginPath();
        ctx.arc(joy.baseX, joy.baseY, 46, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,15,40,0.6)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,120,210,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        const kx = joy.baseX + joy.dx * 34;
        const ky = joy.baseY + joy.dy * 34;
        ctx.beginPath();
        ctx.arc(kx, ky, 24, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(91,58,156,0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,176,255,0.6)';
        ctx.stroke();
      } else {
        // Hint ring in the bottom-left corner.
        ctx.beginPath();
        ctx.arc(70, H - 70, 42, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120,120,200,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(140,140,190,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('MOVE', 70, H - 70);
      }
    }

    function loop(now: number) {
      const dt = Math.min((now - (lastTRef.current || now)) / 1000, 0.05);
      lastTRef.current = now;
      const t = now / 1000;

      // Input vector
      const joy = joyRef.current;
      const keys = keysRef.current;
      let mdx = joy.active ? joy.dx : 0;
      let mdy = joy.active ? joy.dy : 0;
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) mdy -= 1;
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) mdy += 1;
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) mdx -= 1;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) mdx += 1;
      const len = Math.hypot(mdx, mdy);
      if (len > 1) { mdx /= len; mdy /= len; }

      const p = playerRef.current;
      const exp = expRef.current;

      if (!busyRef.current && (mdx || mdy)) {
        const step = SPEED * dt;
        const nx = p.x + mdx * step;
        const ny = p.y + mdy * step;
        if (inRoom(nx, p.y + PLAYER_R) && inRoom(nx, p.y - PLAYER_R)) p.x = nx;

        // Allow walking up into the exit alcoves (y slightly negative near a door).
        let canY = inRoom(p.x + PLAYER_R, ny) && inRoom(p.x - PLAYER_R, ny);
        if (!canY && ny < 0 && exp) {
          for (const ex of exp.room.exits) {
            const ep = exitPos(ex.side);
            if (Math.abs(p.x - ep.x) < 1.1 && ny > -0.6) { canY = true; break; }
          }
        }
        if (canY) p.y = ny;
      }

      // Smooth camera follow
      const cam = cameraRef.current;
      const lerp = Math.min(1, 8 * dt);
      cam.x += (p.x - cam.x) * lerp;
      cam.y += (p.y - cam.y) * lerp;

      // Pickup collection
      if (!busyRef.current && exp) {
        for (const pk of exp.room.pickups) {
          if (pk.collected || collectedRef.current.has(pk.id)) continue;
          if (Math.hypot(p.x - pk.x, p.y - pk.y) < PICKUP_R) doCollect(pk.id);
        }
        // Exit triggers
        for (const ex of exp.room.exits) {
          const ep = exitPos(ex.side);
          if (Math.hypot(p.x - ep.x, p.y - ep.y) < EXIT_R) { doExit(ex.id); break; }
        }
      }

      // ── Render ──
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#07070f';
      ctx.fillRect(0, 0, W, H);
      drawFloor();
      drawEntrance(t);
      drawExits(t);
      drawPickups(t);
      drawPlayer(t);
      drawJoystick();

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('touchstart', noScroll);
      canvas.removeEventListener('touchmove', noScroll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedition?.room.id, doCollect, doExit]);

  // ─── Touch (joystick anchored to bottom-left) ──────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scX = canvas.width / rect.width;
    const scY = canvas.height / rect.height;
    const touch = e.changedTouches[0];
    const cx = (touch.clientX - rect.left) * scX;
    const cy = (touch.clientY - rect.top) * scY;
    // Activate when touching the lower-left control region.
    if (cx < canvas.width * 0.6 && cy > canvas.height * 0.45) {
      joyRef.current = { active: true, baseX: cx, baseY: cy, dx: 0, dy: 0, tid: touch.identifier };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const joy = joyRef.current;
    if (!joy.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scX = canvas.width / rect.width;
    const scY = canvas.height / rect.height;
    const touch = Array.from(e.touches).find((tt) => tt.identifier === joy.tid);
    if (!touch) return;
    const cx = (touch.clientX - rect.left) * scX;
    const cy = (touch.clientY - rect.top) * scY;
    const rdx = cx - joy.baseX, rdy = cy - joy.baseY;
    const d = Math.hypot(rdx, rdy);
    const maxR = 52;
    joy.dx = d > 0 ? rdx / Math.max(d, maxR) : 0;
    joy.dy = d > 0 ? rdy / Math.max(d, maxR) : 0;
  }, []);

  const onTouchEnd = useCallback(() => {
    joyRef.current = { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, tid: -1 };
  }, []);

  if (!expedition) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: '#8888aa' }}>No active expedition.</p>
        <button
          onClick={() => setScreen('base')}
          style={{ background: '#2a2a40', border: 'none', color: '#ccd6f6', padding: '10px 16px', borderRadius: 8, cursor: 'pointer' }}
        >
          ← Back to Base
        </button>
      </div>
    );
  }

  const W = Math.min(480, window.innerWidth);
  const H = Math.floor(window.innerHeight * 0.88);
  const loot = Object.entries(expedition.pendingLoot).filter(([, v]) => (v ?? 0) > 0);

  return (
    <div style={{ position: 'relative', width: W, margin: '0 auto', overflow: 'hidden', background: '#07070f' }}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: 'block', touchAction: 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      />

      {/* HUD: depth + loot */}
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
