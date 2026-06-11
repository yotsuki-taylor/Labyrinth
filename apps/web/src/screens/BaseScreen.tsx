import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { BUILDING_CONFIGS } from '@labyrinth/shared';
import type { BuildingType } from '@labyrinth/shared';
import { REVIVE_GOLD_COST, BARRACKS_UNLOCKS } from '../game/engine.js';

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

      {/* Hero Roster */}
      <div style={s.sectionTitle}>Hero Roster</div>
      <div style={s.rosterGrid}>
        {/* Unlocked heroes */}
        {heroes.map((h) => {
          const timerExpired = h.reviveAt === undefined || Date.now() >= h.reviveAt;
          const canAffordRevive = (resources.gold ?? 0) >= REVIVE_GOLD_COST;
          return (
            <div key={h.id} style={{ ...s.rosterCard, opacity: h.isAlive ? 1 : 0.7, borderColor: h.isAlive ? '#2a2a40' : '#5a2a2a' }}>
              <img
                src={`${import.meta.env.BASE_URL}heroes/${h.class}.png`}
                alt={h.class}
                style={s.rosterImg}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div style={s.rosterName}>{h.name}</div>
              <div style={s.rosterMeta}>Lv {h.level} {h.class}</div>
              {!h.isAlive && (
                timerExpired ? (
                  <button style={{ ...s.reviveBtn, background: '#2d6a4f' }} disabled={loading} onClick={() => reviveHero(h.id)}>
                    Free revive
                  </button>
                ) : (
                  <>
                    <div style={s.rosterTimer}>{formatReviveTimer(h.reviveAt!)}</div>
                    <button
                      style={{ ...s.reviveBtn, opacity: canAffordRevive ? 1 : 0.4 }}
                      disabled={!canAffordRevive || loading}
                      onClick={() => reviveHero(h.id)}
                    >
                      {REVIVE_GOLD_COST}g revive
                    </button>
                  </>
                )
              )}
            </div>
          );
        })}
        {/* Locked heroes */}
        {Object.entries(BARRACKS_UNLOCKS).flatMap(([lvlStr, pool]) => {
          const reqLevel = Number(lvlStr);
          const barracksLevel = buildings.find((b) => b.type === 'barracks')?.level ?? 1;
          if (reqLevel <= barracksLevel) return [];
          const unlockedClasses = new Set(heroes.map((h) => h.class));
          return pool
            .filter((p) => !unlockedClasses.has(p.class))
            .map((p) => (
              <div key={p.class} style={{ ...s.rosterCard, opacity: 0.4, borderColor: '#1a1a2e' }}>
                <div style={{ ...s.rosterImg, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🔒</div>
                <div style={s.rosterName}>{p.name}</div>
                <div style={s.rosterMeta}>{p.class}</div>
                <div style={s.rosterLock}>Barracks Lv {reqLevel}</div>
              </div>
            ));
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
  cardEffect: { fontSize: 11, color: '#a0c4ff', marginBottom: 6, lineHeight: 1.4 },
  costRow: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, marginBottom: 8 },
  gateNote: { fontSize: 11, color: '#facc15', marginBottom: 8 },
  btn: { width: '100%', padding: '6px 0', background: '#3b2d6e', border: 'none', borderRadius: 6, color: '#e0d0ff', cursor: 'pointer', fontSize: 13, transition: 'opacity 0.2s' },
  sectionTitle: { fontSize: 12, color: '#7a7a9a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  rosterGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 },
  rosterCard: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 10, padding: 8, textAlign: 'center' as const },
  rosterImg: { width: '100%', aspectRatio: '1', objectFit: 'cover' as const, borderRadius: 6, marginBottom: 4, display: 'block' as const },
  rosterName: { fontWeight: 700, fontSize: 11, color: '#e0d0ff', marginBottom: 2 },
  rosterMeta: { fontSize: 10, color: '#7a7a9a', marginBottom: 4, textTransform: 'capitalize' as const },
  rosterTimer: { fontSize: 10, color: '#facc15', marginBottom: 4 },
  rosterLock: { fontSize: 10, color: '#facc15' },
  reviveBtn: { width: '100%', padding: '4px 0', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 600, background: '#5b3a9c', transition: 'opacity 0.2s', marginTop: 4 },
  expeditionBtn: { width: '100%', padding: '14px 0', background: '#5b3a9c', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 },
};
