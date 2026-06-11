import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { BUILDING_CONFIGS, HERO_TEMPLATES } from '@labyrinth/shared';
import type { BuildingType, HeroClass } from '@labyrinth/shared';
import { REVIVE_GOLD_COST } from '../game/engine.js';

function formatReviveTimer(reviveAt: number): string {
  const ms = reviveAt - Date.now();
  if (ms <= 0) return 'Ready';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function BaseScreen() {
  const { buildings, resources, heroes, upgradeBuilding, reviveHero, setScreen, loading, error } = useGameStore();

  const hasDead = heroes.some((h) => !h.isAlive);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasDead) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasDead]);

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
          const thLevel = buildings.find((x) => x.type === 'town_hall')?.level ?? 1;
          const gatedByTH = b.type !== 'town_hall' && !atMax && b.level >= thLevel;
          const canAffordResources = !atMax && !gatedByTH && (Object.entries(cost) as [string, number][]).every(
            ([k, v]) => (resources[k as keyof typeof resources] ?? 0) >= v,
          );
          const canUpgrade = canAffordResources && !loading;

          return (
            <div key={b.id} style={s.card}>
              <div style={s.cardTitle}>{cfg.label}</div>
              <div style={s.cardLevel}>Level {b.level} / {cfg.maxLevel}</div>
              <div style={s.cardEffect}>{cfg.effectAt(b.level)}</div>
              {!atMax && !gatedByTH && (
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
              {gatedByTH && (
                <div style={s.gateNote}>Requires TH Lv {b.level + 1}</div>
              )}
              <button
                style={{ ...s.btn, opacity: canUpgrade ? 1 : 0.4 }}
                disabled={!canUpgrade || atMax}
                onClick={() => upgradeBuilding(b.type)}
              >
                {atMax ? 'MAX' : 'Upgrade'}
              </button>
            </div>
          );
        })}
      </div>

      {heroes.length > 0 && (
        <>
          <div style={s.sectionTitle}>Heroes</div>
          <div style={s.heroList}>
            {heroes.map((h) => {
              const tmpl = HERO_TEMPLATES[h.class as HeroClass];
              const timerExpired = h.reviveAt === undefined || Date.now() >= h.reviveAt;
              const canAffordRevive = (resources.gold ?? 0) >= REVIVE_GOLD_COST;
              return (
                <div key={h.id} style={{ ...s.heroCard, opacity: h.isAlive ? 1 : 0.75 }}>
                  <div style={s.heroRow}>
                    <div>
                      <span style={s.heroName}>{h.name}</span>
                      <span style={s.heroMeta}> {tmpl?.label ?? h.class} · Lv {h.level} · {h.xp} XP</span>
                    </div>
                    <span style={s.heroStatus}>{h.isAlive ? '✅' : '💀'}</span>
                  </div>
                  {!h.isAlive && (
                    <div style={s.reviveRow}>
                      {timerExpired ? (
                        <button
                          style={{ ...s.reviveBtn, background: '#2d6a4f' }}
                          disabled={loading}
                          onClick={() => reviveHero(h.id)}
                        >
                          Revive (free)
                        </button>
                      ) : (
                        <>
                          <span style={s.reviveTimer}>Auto-revive: {formatReviveTimer(h.reviveAt!)}</span>
                          <button
                            style={{ ...s.reviveBtn, opacity: canAffordRevive ? 1 : 0.4 }}
                            disabled={!canAffordRevive || loading}
                            onClick={() => reviveHero(h.id)}
                          >
                            Revive ({REVIVE_GOLD_COST}g)
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

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
  cardEffect: { fontSize: 11, color: '#a0c4ff', marginBottom: 6, lineHeight: 1.4 },
  costRow: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, marginBottom: 8 },
  gateNote: { fontSize: 11, color: '#facc15', marginBottom: 8 },
  btn: { width: '100%', padding: '6px 0', background: '#3b2d6e', border: 'none', borderRadius: 6, color: '#e0d0ff', cursor: 'pointer', fontSize: 13, transition: 'opacity 0.2s' },
  sectionTitle: { fontSize: 12, color: '#7a7a9a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  heroList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  heroCard: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 10, padding: '10px 12px' },
  heroRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  heroName: { fontWeight: 700, fontSize: 14, color: '#e0d0ff' },
  heroMeta: { fontSize: 12, color: '#7a7a9a' },
  heroStatus: { fontSize: 16 },
  reviveRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 },
  reviveTimer: { fontSize: 12, color: '#facc15', flex: 1 },
  reviveBtn: { padding: '5px 12px', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: '#5b3a9c', transition: 'opacity 0.2s' },
  expeditionBtn: { width: '100%', padding: '14px 0', background: '#5b3a9c', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 },
};
