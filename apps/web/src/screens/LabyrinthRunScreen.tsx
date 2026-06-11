import { useGameStore } from '../store/gameStore.js';
import type { ExpeditionNodeDTO } from '@labyrinth/shared';

export function LabyrinthRunScreen() {
  const { expedition, moveToNode, extract, setScreen, loading, error } = useGameStore();

  if (!expedition) {
    return (
      <div style={s.page}>
        <p style={{ color: '#8888aa' }}>No active expedition.</p>
        <button style={s.btn} onClick={() => setScreen('base')}>← Back to Base</button>
      </div>
    );
  }

  const currentNode = expedition.nodes.find((n) => n.id === expedition.currentNodeId);
  const connectedNodes = expedition.nodes.filter((n) =>
    currentNode?.connections.includes(n.id),
  );

  const isOnExit = currentNode?.type === 'exit';
  const pendingLoot = expedition.pendingLoot;
  const hasLoot = Object.values(pendingLoot).some((v) => (v ?? 0) > 0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>🗺️ Labyrinth</h2>
        <div style={s.lootBadge}>
          {hasLoot
            ? `Loot: ${Object.entries(pendingLoot).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${k}:${v}`).join(' ')}`
            : 'No loot yet'}
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Mini map */}
      <div style={s.mapContainer}>
        <svg width="100%" height="220" viewBox="0 0 700 300" style={{ background: '#0d0d1a', borderRadius: 10 }}>
          {/* Draw edges */}
          {expedition.nodes.flatMap((node) =>
            node.connections.map((targetId) => {
              const target = expedition.nodes.find((n) => n.id === targetId);
              if (!target || target.id < node.id) return null;
              return (
                <line
                  key={`${node.id}-${targetId}`}
                  x1={node.x * (700 / 700)} y1={node.y * (300 / 500)}
                  x2={target.x * (700 / 700)} y2={target.y * (300 / 500)}
                  stroke="#2a2a40" strokeWidth={2}
                />
              );
            }),
          )}
          {/* Draw nodes */}
          {expedition.nodes.map((node) => (
            <NodeDot
              key={node.id}
              node={node}
              isCurrent={node.id === expedition.currentNodeId}
              isConnected={connectedNodes.some((n) => n.id === node.id)}
              onClick={() => !loading && moveToNode(node.id)}
            />
          ))}
        </svg>
      </div>

      {/* Current node info */}
      <div style={s.nodeInfo}>
        <div style={s.nodeType}>{nodeLabel(currentNode?.type)}</div>
        <div style={s.nodeDesc}>{nodeDesc(currentNode?.type)}</div>
      </div>

      {/* Movement buttons */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Move to:</div>
        {connectedNodes.length === 0 && <div style={s.noMoves}>No connected nodes.</div>}
        <div style={s.moveGrid}>
          {connectedNodes.map((n) => (
            <button
              key={n.id}
              style={{ ...s.moveBtn, opacity: loading ? 0.5 : 1 }}
              disabled={loading}
              onClick={() => moveToNode(n.id)}
            >
              {nodeIcon(n.type)} {nodeLabel(n.type)}
              {n.visited && <span style={s.visited}> ✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Extract button on exit node */}
      {isOnExit && (
        <button
          style={{ ...s.extractBtn, opacity: loading ? 0.5 : 1 }}
          disabled={loading}
          onClick={extract}
        >
          🚪 Extract — Secure Your Loot!
        </button>
      )}
    </div>
  );
}

function NodeDot({
  node,
  isCurrent,
  isConnected,
  onClick,
}: {
  node: ExpeditionNodeDTO;
  isCurrent: boolean;
  isConnected: boolean;
  onClick: () => void;
}) {
  const cx = node.x * (700 / 700);
  const cy = node.y * (300 / 500);
  const r = isCurrent ? 12 : 8;
  const fill = isCurrent
    ? '#c9b0ff'
    : isConnected
    ? '#7b5ea7'
    : node.visited
    ? '#3a3a5a'
    : '#1e1e35';
  const stroke = isCurrent ? '#fff' : isConnected ? '#c9b0ff' : '#2a2a50';

  return (
    <g onClick={onClick} style={{ cursor: isConnected || isCurrent ? 'pointer' : 'default' }}>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={2} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fill="#fff" style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {nodeIcon(node.type)}
      </text>
    </g>
  );
}

function nodeIcon(type?: string) {
  const m: Record<string, string> = { start: '🏁', empty: '·', loot: '💎', pve_combat: '💀', exit: '🚪' };
  return m[type ?? ''] ?? '?';
}

function nodeLabel(type?: string) {
  const m: Record<string, string> = { start: 'Start', empty: 'Empty Room', loot: 'Loot Room', pve_combat: 'Enemies!', exit: 'Exit' };
  return m[type ?? ''] ?? 'Unknown';
}

function nodeDesc(type?: string) {
  const m: Record<string, string> = {
    start: 'You entered the labyrinth here.',
    empty: 'Nothing here. Keep moving.',
    loot: 'Resources scattered on the floor.',
    pve_combat: 'Monsters lurk in the shadows.',
    exit: 'The exit portal glows. Extract to secure your loot!',
  };
  return m[type ?? ''] ?? '';
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 700, color: '#c9b0ff' },
  lootBadge: { fontSize: 11, background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 6, padding: '4px 8px', color: '#facc15' },
  error: { background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8, padding: 10, marginBottom: 12, color: '#f87171', fontSize: 13 },
  mapContainer: { marginBottom: 12, borderRadius: 10, overflow: 'hidden' },
  nodeInfo: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 8, padding: '10px 14px', marginBottom: 12 },
  nodeType: { fontWeight: 700, fontSize: 15, color: '#e0d0ff', marginBottom: 2 },
  nodeDesc: { fontSize: 13, color: '#8888aa' },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, color: '#7a7a9a', marginBottom: 8 },
  noMoves: { color: '#5a5a7a', fontSize: 13 },
  moveGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  moveBtn: { background: '#1e1e35', border: '1px solid #3a3a5a', borderRadius: 8, color: '#ccd6f6', padding: '10px 8px', cursor: 'pointer', fontSize: 13, textAlign: 'center' },
  visited: { color: '#4ade80', fontSize: 11 },
  btn: { background: '#2a2a40', border: 'none', color: '#ccd6f6', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  extractBtn: { width: '100%', padding: '14px 0', background: '#14532d', border: '2px solid #4ade80', borderRadius: 12, color: '#4ade80', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
};
