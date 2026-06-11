import { useGameStore } from '../store/gameStore.js';
import { BUILDING_CONFIGS } from '@labyrinth/shared';
import type { BuildingType } from '@labyrinth/shared';

export function BaseScreen() {
  const { buildings, resources, upgradeBuilding, setScreen, loading, error } = useGameStore();

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>🏰 Base</h2>
        <button style={s.profileBtn} onClick={() => setScreen('profile')}>👤 Profile</button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.grid}>
        {buildings.map((b) => {
          const cfg = BUILDING_CONFIGS[b.type as BuildingType];
          if (!cfg) return null;
          const cost = cfg.upgradeCost(b.level);
          const atMax = b.level >= cfg.maxLevel;

          const canAfford = !atMax && (Object.entries(cost) as [string, number][]).every(
            ([k, v]) => (resources[k as keyof typeof resources] ?? 0) >= v,
          );

          return (
            <div key={b.id} style={s.card}>
              <div style={s.cardTitle}>{cfg.label}</div>
              <div style={s.cardLevel}>Level {b.level} / {cfg.maxLevel}</div>
              <div style={s.cardDesc}>{cfg.description}</div>
              {!atMax && (
                <div style={s.costRow}>
                  {(Object.entries(cost) as [string, number][])
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <span key={k} style={{ color: (resources[k as keyof typeof resources] ?? 0) >= v ? '#4ade80' : '#f87171' }}>
                        {k}: {v}
                      </span>
                    ))}
                </div>
              )}
              <button
                style={{ ...s.btn, opacity: canAfford && !loading ? 1 : 0.4 }}
                disabled={!canAfford || loading || atMax}
                onClick={() => upgradeBuilding(b.type)}
              >
                {atMax ? 'MAX' : 'Upgrade'}
              </button>
            </div>
          );
        })}
      </div>

      <button style={s.expeditionBtn} onClick={() => setScreen('expedition_prep')}>
        ⚔️ Start Expedition
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, color: '#c9b0ff' },
  profileBtn: { background: '#2a2a40', border: 'none', color: '#ccd6f6', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  error: { background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8, padding: 10, marginBottom: 12, color: '#f87171', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 },
  card: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 10, padding: 12 },
  cardTitle: { fontWeight: 700, fontSize: 14, marginBottom: 2, color: '#c9b0ff' },
  cardLevel: { fontSize: 12, color: '#7a7a9a', marginBottom: 4 },
  cardDesc: { fontSize: 11, color: '#8888aa', marginBottom: 8, lineHeight: 1.4 },
  costRow: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, marginBottom: 8 },
  btn: { width: '100%', padding: '6px 0', background: '#3b2d6e', border: 'none', borderRadius: 6, color: '#e0d0ff', cursor: 'pointer', fontSize: 13, transition: 'opacity 0.2s' },
  expeditionBtn: { width: '100%', padding: '14px 0', background: '#5b3a9c', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 },
};
