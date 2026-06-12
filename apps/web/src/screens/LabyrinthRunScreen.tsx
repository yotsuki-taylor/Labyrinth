import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore.js';
import type { ExpeditionDTO } from '@labyrinth/shared';

// ─── Isometric map constants ───────────────────────────────────────────────
const TW = 56;   // tile pixel width
const TH = 28;   // tile pixel height (TW / 2 = perfect isometric)
const ROWS = 13;
const COLS = 12;
const SPEED = 4.0; // tiles per second

// 0 = void, 1 = floor
const MAP: number[][] = [
  [0,0,0,0,1,0,0,1,0,0,0,0], // row  0  exit corridors (col 4 left, col 7 right)
  [0,0,0,0,1,0,0,1,0,0,0,0], // row  1
  [0,0,0,0,1,0,0,1,0,0,0,0], // row  2
  [0,0,1,1,1,1,1,1,1,1,0,0], // row  3  T-junction (cols 2–9)
  [0,0,0,0,0,1,1,0,0,0,0,0], // row  4  main corridor (cols 5–6)
  [0,0,0,0,0,1,1,0,0,0,0,0], // row  5
  [0,0,0,1,1,1,1,1,1,0,0,0], // row  6  combat room (cols 3–8)
  [0,0,0,1,1,1,1,1,1,0,0,0], // row  7
  [0,0,0,0,0,1,1,0,0,0,0,0], // row  8  loot / first-room corridor
  [0,0,0,0,0,1,1,0,0,0,0,0], // row  9
  [0,0,0,0,1,1,1,1,0,0,0,0], // row 10  starting room (cols 4–7)
  [0,0,0,0,1,1,1,1,0,0,0,0], // row 11
  [0,0,0,0,1,1,1,1,0,0,0,0], // row 12  spawn
];

// Zone definitions — each maps to an expedition node by index.
// Positions match the tile map geometry above.
const ZONES = [
  { id: 'z0', nodeIdx: 0, cx: 5.5, cy: 12.0, r: 0.8 }, // start (pre-triggered)
  { id: 'z1', nodeIdx: 1, cx: 5.5, cy:  8.5, r: 0.9 }, // first room
  { id: 'z2', nodeIdx: 2, cx: 5.5, cy:  6.5, r: 1.0 }, // combat room
  { id: 'z3', nodeIdx: 3, cx: 5.5, cy:  3.5, r: 1.0 }, // junction
  { id: 'z4', nodeIdx: 4, cx: 4.0, cy:  1.5, r: 0.8 }, // left branch
  { id: 'z5', nodeIdx: 5, cx: 7.0, cy:  1.5, r: 0.8 }, // right branch
  { id: 'z6', nodeIdx: 6, cx: 4.0, cy:  0.5, r: 0.8 }, // exit left
  { id: 'z7', nodeIdx: 7, cx: 7.0, cy:  0.5, r: 0.8 }, // exit right
] as const;

// Module-level: persist player position across combat unmount/remount
let _savedPos: { x: number; y: number; expId: string } | null = null;

function getStartPos(exp: ExpeditionDTO): { x: number; y: number } {
  if (_savedPos?.expId === exp.id) return { x: _savedPos.x, y: _savedPos.y };
  const visited = exp.nodes.filter(n => n.visited).length;
  if (visited >= 4) return { x: 5.5, y: 3.5 }; // past junction
  if (visited >= 3) return { x: 5.5, y: 6.5 }; // past combat
  if (visited >= 2) return { x: 5.5, y: 8.5 }; // past first room
  return { x: 5.5, y: 12 };
}

// ─── Component ─────────────────────────────────────────────────────────────
export function LabyrinthRunScreen() {
  const { expedition, moveToNode, extract, setScreen, error } = useGameStore();
  const [extractReady, setExtractReady] = useState(false);

  // Track when player reaches an exit node
  useEffect(() => {
    if (!expedition) return;
    const cur = expedition.nodes.find(n => n.id === expedition.currentNodeId);
    setExtractReady(!!cur && cur.type === 'exit');
  }, [expedition]);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const playerRef    = useRef({ x: 5.5, y: 12 });
  const cameraRef    = useRef({ x: 5.5, y: 12 });
  const joystickRef  = useRef({ active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, tid: -1 });
  const keysRef      = useRef(new Set<string>());
  const triggeredRef = useRef(new Set<string>());
  const busyRef      = useRef(false);
  const expRef       = useRef(expedition);
  const rafRef       = useRef(0);
  const lastTRef     = useRef(0);

  useEffect(() => { expRef.current = expedition; }, [expedition]);

  // Initialise / reset state when a new expedition starts
  useEffect(() => {
    if (!expedition) return;
    const pos = getStartPos(expedition);
    playerRef.current  = { ...pos };
    cameraRef.current  = { ...pos };
    const tr = triggeredRef.current;
    tr.clear();
    for (const z of ZONES) {
      const node = expedition.nodes[z.nodeIdx];
      if (node?.visited) tr.add(z.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedition?.id]);

  // Keyboard input
  useEffect(() => {
    const dn = (e: KeyboardEvent) => keysRef.current.add(e.key);
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  const doMove = useCallback(async (nodeId: string, zoneId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    triggeredRef.current.add(zoneId);
    _savedPos = { ...playerRef.current, expId: expRef.current?.id ?? '' };
    try { await moveToNode(nodeId); }
    finally { busyRef.current = false; }
  }, [moveToNode]);

  // ─── rAF loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !expedition) return;

    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d')!;

    // Prevent scroll while touching the canvas
    const noScroll = (e: TouchEvent) => e.preventDefault();
    canvas.addEventListener('touchstart', noScroll, { passive: false });
    canvas.addEventListener('touchmove',  noScroll, { passive: false });

    function tileToScreen(tx: number, ty: number) {
      const cx = cameraRef.current.x, cy = cameraRef.current.y;
      return {
        sx: (tx - ty - cx + cy) * (TW / 2) + W / 2,
        sy: (tx + ty - cx - cy) * (TH / 2) + H * 0.38,
      };
    }

    function isWalkable(x: number, y: number): boolean {
      const col = Math.floor(x), row = Math.floor(y);
      return row >= 0 && row < ROWS && col >= 0 && col < COLS && MAP[row][col] === 1;
    }

    function drawTile(col: number, row: number) {
      if (MAP[row][col] !== 1) return;
      const { sx, sy } = tileToScreen(col, row);
      if (sx < -TW || sx > W + TW || sy < -TH * 3 || sy > H + TH * 2) return;

      ctx.beginPath();
      ctx.moveTo(sx,          sy);
      ctx.lineTo(sx + TW / 2, sy + TH / 2);
      ctx.lineTo(sx,          sy + TH);
      ctx.lineTo(sx - TW / 2, sy + TH / 2);
      ctx.closePath();

      const g = ctx.createLinearGradient(sx, sy, sx, sy + TH);
      g.addColorStop(0, '#3e3e5c');
      g.addColorStop(0.6, '#2c2c44');
      g.addColorStop(1, '#1a1a2c');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#22223a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function drawZones(t: number) {
      const exp = expRef.current;
      if (!exp) return;
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const z of ZONES) {
        const node = exp.nodes[z.nodeIdx];
        if (!node) continue;
        const { sx, sy } = tileToScreen(z.cx, z.cy);
        const visited = triggeredRef.current.has(z.id);

        if (visited) {
          if (node.type !== 'start') {
            ctx.fillStyle = 'rgba(120,120,160,0.35)';
            ctx.font = '11px sans-serif';
            ctx.fillText('✓', sx, sy - 6);
          }
          continue;
        }

        let color = '', icon = '';
        if      (node.type === 'exit')       { color = '#4ade80'; icon = '🚪'; }
        else if (node.type === 'pve_combat') { color = '#f87171'; icon = '💀'; }
        else if (node.type === 'loot')       { color = '#facc15'; icon = '💰'; }
        else if (node.type === 'empty' && z.nodeIdx === 3) { color = '#a0a0ff'; icon = '⛩️'; }
        else continue;

        const grd = ctx.createRadialGradient(sx, sy - 6, 0, sx, sy - 6, 22 * pulse);
        grd.addColorStop(0, color + '55');
        grd.addColorStop(1, color + '00');
        ctx.beginPath();
        ctx.arc(sx, sy - 6, 22 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.font = '20px sans-serif';
        ctx.fillText(icon, sx, sy - 6);
      }
    }

    function drawPlayer(t: number) {
      const p = playerRef.current;
      const { sx, sy } = tileToScreen(p.x, p.y);
      const glow = 7 + 2 * Math.sin(t * 3);

      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, glow + 12);
      grd.addColorStop(0, 'rgba(201,176,255,0.75)');
      grd.addColorStop(1, 'rgba(201,176,255,0)');
      ctx.beginPath();
      ctx.arc(sx, sy, glow + 12, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#c9b0ff';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function drawJoystick() {
      const joy = joystickRef.current;
      if (joy.active) {
        ctx.beginPath();
        ctx.arc(joy.baseX, joy.baseY, 44, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,15,40,0.65)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,100,200,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const kx = joy.baseX + joy.dx * 32;
        const ky = joy.baseY + joy.dy * 32;
        ctx.beginPath();
        ctx.arc(kx, ky, 22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(91,58,156,0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,176,255,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Subtle hint ring
        ctx.beginPath();
        ctx.arc(W - 68, H - 68, 40, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100,100,180,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    function loop(now: number) {
      const dt = Math.min((now - (lastTRef.current || now)) / 1000, 0.05);
      lastTRef.current = now;
      const t = now / 1000;

      // ── Movement ──────────────────────────────────────────────────────
      const joy  = joystickRef.current;
      const keys = keysRef.current;
      let mdx = joy.active ? joy.dx : 0;
      let mdy = joy.active ? joy.dy : 0;
      if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) mdy -= 1;
      if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) mdy += 1;
      if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) mdx -= 1;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) mdx += 1;
      const mlen = Math.hypot(mdx, mdy);
      if (mlen > 1) { mdx /= mlen; mdy /= mlen; }

      const p = playerRef.current;
      const step = SPEED * dt;
      const R = 0.32; // collision radius
      const nx = p.x + mdx * step;
      const ny = p.y + mdy * step;

      if (isWalkable(nx, p.y) && isWalkable(nx, p.y + R) && isWalkable(nx, p.y - R)) p.x = nx;
      if (isWalkable(p.x, ny) && isWalkable(p.x + R, ny) && isWalkable(p.x - R, ny)) p.y = ny;

      // ── Camera lerp ───────────────────────────────────────────────────
      const cam = cameraRef.current;
      const lf = Math.min(1, 8 * dt);
      cam.x += (p.x - cam.x) * lf;
      cam.y += (p.y - cam.y) * lf;

      // ── Zone triggers ─────────────────────────────────────────────────
      if (!busyRef.current) {
        const exp = expRef.current;
        if (exp) {
          for (const z of ZONES) {
            if (triggeredRef.current.has(z.id)) continue;
            const node = exp.nodes[z.nodeIdx];
            if (!node) continue;
            if (Math.hypot(p.x - z.cx, p.y - z.cy) < z.r) {
              const cur = exp.nodes.find(n => n.id === exp.currentNodeId);
              if (cur?.connections.includes(node.id)) {
                doMove(node.id, z.id);
              }
            }
          }
        }
      }

      // ── Render ────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#07070f';
      ctx.fillRect(0, 0, W, H);

      // Painter's algorithm: draw tiles back-to-front by diagonal sum
      for (let sum = 0; sum < ROWS + COLS - 1; sum++) {
        const rMin = Math.max(0, sum - COLS + 1);
        const rMax = Math.min(ROWS - 1, sum);
        for (let row = rMin; row <= rMax; row++) {
          drawTile(sum - row, row);
        }
      }

      drawZones(t);
      drawPlayer(t);
      drawJoystick();

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('touchstart', noScroll);
      canvas.removeEventListener('touchmove',  noScroll);
    };
  // Re-run only when expedition id changes (not every expedition update)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedition?.id, doMove]);

  // ─── Touch handlers ───────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scX = canvas.width / rect.width;
    const scY = canvas.height / rect.height;
    const touch = e.changedTouches[0];
    const cx = (touch.clientX - rect.left) * scX;
    const cy = (touch.clientY - rect.top)  * scY;

    // Bottom 45% → joystick
    if (cy > canvas.height * 0.55) {
      joystickRef.current = { active: true, baseX: cx, baseY: cy, dx: 0, dy: 0, tid: touch.identifier };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const joy = joystickRef.current;
    if (!joy.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scX = canvas.width / rect.width;
    const scY = canvas.height / rect.height;
    const touch = Array.from(e.touches).find(t => t.identifier === joy.tid);
    if (!touch) return;
    const cx = (touch.clientX - rect.left) * scX;
    const cy = (touch.clientY - rect.top)  * scY;
    const rdx = cx - joy.baseX, rdy = cy - joy.baseY;
    const len = Math.hypot(rdx, rdy);
    const maxR = 50;
    joy.dx = len > 0 ? rdx / Math.max(len, maxR) : 0;
    joy.dy = len > 0 ? rdy / Math.max(len, maxR) : 0;
  }, []);

  const handleTouchEnd = useCallback(() => {
    joystickRef.current = { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, tid: -1 };
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
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
  const H = Math.floor(window.innerHeight * 0.87);

  const pendingLoot = Object.entries(expedition.pendingLoot).filter(([, v]) => (v ?? 0) > 0);

  return (
    <div style={{ position: 'relative', width: W, overflow: 'hidden', background: '#07070f' }}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ display: 'block', touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />

      {/* Loot badge */}
      {pendingLoot.length > 0 && (
        <div style={ui.loot}>
          💰 {pendingLoot.map(([k, v]) => `${k}:${v}`).join(' ')}
        </div>
      )}

      {/* Controls hint */}
      <div style={ui.hint}>↑ move · joystick bottom-right</div>

      {/* Error */}
      {error && <div style={ui.error}>{error}</div>}

      {/* Extract button */}
      {extractReady && (
        <button onClick={extract} style={ui.extractBtn}>
          🚪 Extract — Secure Your Loot!
        </button>
      )}
    </div>
  );
}

const ui: Record<string, React.CSSProperties> = {
  loot: {
    position: 'absolute', top: 8, left: 8,
    background: 'rgba(15,15,35,0.85)', border: '1px solid #3a3a50',
    borderRadius: 8, padding: '5px 10px', color: '#facc15', fontSize: 12,
    pointerEvents: 'none',
  },
  hint: {
    position: 'absolute', top: 8, right: 8,
    color: 'rgba(120,120,160,0.5)', fontSize: 10, pointerEvents: 'none',
  },
  error: {
    position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)',
    background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8,
    padding: '6px 14px', color: '#f87171', fontSize: 12, whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  extractBtn: {
    position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
    background: '#14532d', border: '2px solid #4ade80', borderRadius: 12,
    color: '#4ade80', fontSize: 15, fontWeight: 700, padding: '13px 28px',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
};
