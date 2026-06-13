// Standalone faithful preview of LabyrinthRunScreen: reproduces the room
// generator + isometric projection and emits an SVG (vector, opens anywhere).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const RES_ICON = { gold: '🪙', stone: '🪨', iron: '⚙️', essence: '✨', relics: '🔮' };

function rollRoomType() {
  const r = Math.random();
  if (r < 0.45) return 'loot';
  if (r < 0.60) return 'treasure';
  return 'empty';
}
function pickupPlan(type, depth) {
  const d = Math.floor(depth / 2);
  if (type === 'start') return { count: ri(1, 2), rare: false };
  if (type === 'empty') return { count: ri(1, 3) + d, rare: false };
  if (type === 'loot') return { count: ri(4, 6) + d, rare: false };
  return { count: ri(3, 5) + d, rare: true };
}
function rollResource(rare) {
  const r = Math.random();
  if (rare) {
    if (r < 0.45) return { resource: 'essence', amount: ri(2, 6) };
    if (r < 0.70) return { resource: 'relics', amount: ri(1, 2) };
    if (r < 0.88) return { resource: 'iron', amount: ri(10, 25) };
    return { resource: 'gold', amount: ri(40, 90) };
  }
  if (r < 0.50) return { resource: 'gold', amount: ri(8, 30) };
  if (r < 0.78) return { resource: 'stone', amount: ri(5, 20) };
  if (r < 0.93) return { resource: 'iron', amount: ri(3, 12) };
  if (r < 0.99) return { resource: 'essence', amount: ri(1, 3) };
  return { resource: 'relics', amount: 1 };
}
function generateRoom(depth, maxDepth, type) {
  const width = ri(8, 11), height = ri(9, 12);
  const isFinal = depth >= maxDepth - 1;
  const { count, rare } = pickupPlan(type, depth);
  const pickups = [], used = new Set();
  let attempts = 0;
  while (pickups.length < count && attempts < count * 8) {
    attempts++;
    const x = ri(1, width - 2), y = ri(2, height - 3), key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);
    const { resource, amount } = rollResource(rare && Math.random() < 0.6);
    pickups.push({ resource, amount, x, y });
  }
  const exits = [
    { side: 'left', leadsTo: isFinal ? type : rollRoomType(), isExtract: isFinal },
    { side: 'right', leadsTo: isFinal ? type : rollRoomType(), isExtract: isFinal },
  ];
  return { depth, type, width, height, pickups, exits, isFinal };
}
function previewIcon(type, isExtract) {
  if (isExtract) return '🚪';
  if (type === 'loot') return '💰';
  if (type === 'treasure') return '💎';
  return '·';
}

// ── Render one room to SVG (mirrors the screen's projection exactly) ──
function renderSVG(room, heroB64) {
  const W = 480, H = 820;
  const RW = room.width, RH = room.height;
  const span = (RW - 1) + (RH - 1);
  const twFit = (W * 0.92) / Math.max(1, span);
  const thFit = (H * 0.62) / Math.max(1, span);
  const TW = Math.max(22, Math.min(64, Math.min(twFit, thFit * 2)));
  const TH = TW / 2;
  const camX = (RW - 1) / 2, camY = (RH - 1) / 2, ANCHOR_Y = H * 0.46;
  const toS = (tx, ty) => ({
    sx: (tx - ty - (camX - camY)) * (TW / 2) + W / 2,
    sy: (tx + ty - (camX + camY)) * (TH / 2) + ANCHOR_Y,
  });
  const exitPos = (s) => ({ x: s === 'left' ? RW * 0.24 : RW * 0.76, y: -0.15 });
  const entrance = { x: (RW - 1) / 2, y: RH - 0.85 };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  let out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">`);
  out.push(`<defs>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3c3c5a"/><stop offset="0.6" stop-color="#2a2a42"/><stop offset="1" stop-color="#191929"/>
    </linearGradient>
    <radialGradient id="pglow"><stop offset="0" stop-color="#facc15" stop-opacity="0.45"/><stop offset="1" stop-color="#facc15" stop-opacity="0"/></radialGradient>
    <radialGradient id="aura"><stop offset="0" stop-color="#c9b0ff" stop-opacity="0.6"/><stop offset="1" stop-color="#c9b0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="exgreen"><stop offset="0" stop-color="#4ade80" stop-opacity="0.5"/><stop offset="1" stop-color="#4ade80" stop-opacity="0"/></radialGradient>
    <radialGradient id="exgold"><stop offset="0" stop-color="#facc15" stop-opacity="0.5"/><stop offset="1" stop-color="#facc15" stop-opacity="0"/></radialGradient>
    <radialGradient id="expurple"><stop offset="0" stop-color="#c9b0ff" stop-opacity="0.5"/><stop offset="1" stop-color="#c9b0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="exblue"><stop offset="0" stop-color="#7a8cff" stop-opacity="0.5"/><stop offset="1" stop-color="#7a8cff" stop-opacity="0"/></radialGradient>
    <clipPath id="heroClip"><circle id="hc" cx="0" cy="0" r="1"/></clipPath>
  </defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="#07070f"/>`);

  // Floor (painter's order by diagonal)
  for (let sum = 0; sum <= (RW - 1) + (RH - 1); sum++) {
    for (let col = 0; col < RW; col++) {
      const r = sum - col;
      if (r < 0 || r >= RH) continue;
      const { sx, sy } = toS(col, r);
      const tw = TW * 0.98, th = TH * 0.98;
      out.push(`<polygon points="${sx},${sy} ${sx + tw / 2},${sy + th / 2} ${sx},${sy + th} ${sx - tw / 2},${sy + th / 2}" fill="url(#floor)" stroke="#20203a" stroke-width="1"/>`);
    }
  }

  // Entrance
  {
    const { sx, sy } = toS(entrance.x, entrance.y);
    out.push(`<text x="${sx}" y="${sy}" font-size="${TW * 0.5}" text-anchor="middle" dominant-baseline="central" opacity="0.6">⛩️</text>`);
  }

  // Exits
  for (const ex of room.exits) {
    const p = exitPos(ex.side);
    const { sx, sy } = toS(p.x, p.y);
    const grad = ex.isExtract ? 'exgreen' : ex.leadsTo === 'treasure' ? 'exgold' : ex.leadsTo === 'loot' ? 'expurple' : 'exblue';
    const color = ex.isExtract ? '#4ade80' : ex.leadsTo === 'treasure' ? '#facc15' : ex.leadsTo === 'loot' ? '#c9b0ff' : '#7a8cff';
    out.push(`<circle cx="${sx}" cy="${sy}" r="${TW * 0.9}" fill="url(#${grad})"/>`);
    out.push(`<text x="${sx}" y="${sy}" font-size="${TW * 0.85}" text-anchor="middle" dominant-baseline="central">🚪</text>`);
    out.push(`<text x="${sx}" y="${sy - TW * 0.7}" font-size="${TW * 0.5}" text-anchor="middle" dominant-baseline="central">${previewIcon(ex.leadsTo, ex.isExtract)}</text>`);
    out.push(`<text x="${sx}" y="${sy + TW * 0.55}" font-size="11" font-weight="700" text-anchor="middle" fill="${color}">${ex.isExtract ? 'EXTRACT' : ex.leadsTo.toUpperCase()}</text>`);
  }

  // Pickups
  for (const pk of room.pickups) {
    const { sx, sy } = toS(pk.x, pk.y);
    out.push(`<ellipse cx="${sx}" cy="${sy + TH * 0.1}" rx="${TW * 0.18}" ry="${TH * 0.18}" fill="rgba(0,0,0,0.35)"/>`);
    out.push(`<circle cx="${sx}" cy="${sy - 6}" r="${TW * 0.34}" fill="url(#pglow)"/>`);
    out.push(`<text x="${sx}" y="${sy - 6}" font-size="${TW * 0.5}" text-anchor="middle" dominant-baseline="central">${RES_ICON[pk.resource]}</text>`);
  }

  // Player token at entrance, portrait clipped to circle
  {
    const { sx, sy } = toS((RW - 1) / 2, RH - 1);
    const r = Math.max(11, TW * 0.32);
    const cy = sy - r;
    out.push(`<ellipse cx="${sx}" cy="${sy + r * 0.5}" rx="${r * 0.8}" ry="${r * 0.4}" fill="rgba(0,0,0,0.4)"/>`);
    out.push(`<circle cx="${sx}" cy="${cy}" r="${r + 8}" fill="url(#aura)"/>`);
    if (heroB64) {
      out.push(`<clipPath id="hcp"><circle cx="${sx}" cy="${cy}" r="${r}"/></clipPath>`);
      out.push(`<image x="${sx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#hcp)" xlink:href="data:image/png;base64,${heroB64}"/>`);
    } else {
      out.push(`<circle cx="${sx}" cy="${cy}" r="${r}" fill="#c9b0ff"/>`);
    }
    out.push(`<circle cx="${sx}" cy="${cy}" r="${r}" fill="none" stroke="#e8d8ff" stroke-width="2"/>`);
  }

  // HUD
  out.push(`<rect x="8" y="8" rx="8" width="118" height="24" fill="rgba(15,15,35,0.85)" stroke="#3a3a50"/>`);
  out.push(`<text x="18" y="24" font-size="12" font-weight="700" fill="#c9b0ff">Room ${room.depth + 1} / 5</text>`);
  if (room.isFinal) {
    out.push(`<rect x="${W / 2 - 150}" y="40" rx="8" width="300" height="22" fill="rgba(20,83,45,0.9)" stroke="#4ade80"/>`);
    out.push(`<text x="${W / 2}" y="55" font-size="11" text-anchor="middle" fill="#4ade80">🚪 Both doors lead to extraction — secure your loot!</text>`);
  }
  // Joystick hint (bottom-left)
  out.push(`<circle cx="70" cy="${H - 70}" r="42" fill="none" stroke="rgba(120,120,200,0.25)" stroke-width="2"/>`);
  out.push(`<text x="70" y="${H - 70}" font-size="10" text-anchor="middle" dominant-baseline="central" fill="rgba(140,140,190,0.6)">MOVE</text>`);

  out.push(`</svg>`);
  return out.join('\n');
}

// ── Generate & write ──
const heroB64 = readFileSync('apps/web/public/heroes/warrior.png').toString('base64');
mkdirSync('preview', { recursive: true });

const lootRoom = generateRoom(2, 5, 'loot');     // mid-run loot room, two onward doors
const finalRoom = generateRoom(4, 5, 'treasure'); // final room, both doors extract

writeFileSync('preview/room-loot.svg', renderSVG(lootRoom, heroB64));
writeFileSync('preview/room-final.svg', renderSVG(finalRoom, heroB64));
console.log('loot room  :', JSON.stringify({ ...lootRoom, pickups: lootRoom.pickups.length }));
console.log('final room :', JSON.stringify({ ...finalRoom, pickups: finalRoom.pickups.length }));
console.log('wrote preview/room-loot.svg, preview/room-final.svg');
