import { useGameStore } from '../store/gameStore.js';
import { HERO_TEMPLATES } from '@labyrinth/shared';
import type { HeroClass } from '@labyrinth/shared';

export function ProfileScreen() {
  const { username, resources, heroes, setScreen } = useGameStore();

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.back} onClick={() => setScreen('base')}>← Back</button>
        <h2 style={s.title}>👤 Profile & Inventory</h2>
      </div>

      <div style={s.playerCard}>
        <div style={s.playerName}>{username || 'Adventurer'}</div>
        <div style={s.playerSub}>Labyrinth Explorer</div>
      </div>

      <div style={s.sectionTitle}>Resources</div>
      <div style={s.resourceGrid}>
        {(Object.entries(resources) as [string, number][]).map(([k, v]) => (
          <div key={k} style={s.resCard}>
            <div style={s.resVal}>{v}</div>
            <div style={s.resKey}>{k}</div>
          </div>
        ))}
      </div>

      <div style={s.sectionTitle}>Heroes ({heroes.length})</div>
      {heroes.map((h) => {
        const tmpl = HERO_TEMPLATES[h.class as HeroClass];
        const hpPct = Math.round((h.stats.hp / h.stats.maxHp) * 100);
        return (
          <div key={h.id} style={{ ...s.heroCard, opacity: h.isAlive ? 1 : 0.5 }}>
            <div style={s.heroRow}>
              <div>
                <div style={s.heroName}>{h.name}</div>
                <div style={s.heroClass}>{tmpl?.label ?? h.class} · Lv {h.level} · XP {h.xp}</div>
              </div>
              <div style={s.heroStatus}>{h.isAlive ? '✅' : '💀'}</div>
            </div>
            <div style={s.heroAbility}>
              <span style={s.abilityLabel}>Ability: </span>
              {tmpl?.ability ?? '—'}
            </div>
            <div style={s.statsRow}>
              <span>❤️ {h.stats.hp}/{h.stats.maxHp}</span>
              <span>⚔️ {h.stats.attack}</span>
              <span>🛡️ {h.stats.defense}</span>
              <span>💨 {h.stats.speed}</span>
            </div>
            <div style={s.hpBg}>
              <div style={{ ...s.hpFill, width: `${hpPct}%`, background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#f87171' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  back: { background: 'none', border: 'none', color: '#8888cc', cursor: 'pointer', fontSize: 14, padding: 0 },
  title: { fontSize: 18, fontWeight: 700, color: '#c9b0ff' },
  playerCard: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 10, padding: '14px 16px', marginBottom: 20, textAlign: 'center' },
  playerName: { fontSize: 18, fontWeight: 700, color: '#e0d0ff' },
  playerSub: { fontSize: 12, color: '#7a7a9a', marginTop: 4 },
  sectionTitle: { fontSize: 13, color: '#7a7a9a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  resourceGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 },
  resCard: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 8, padding: '10px 4px', textAlign: 'center' },
  resVal: { fontSize: 16, fontWeight: 700, color: '#facc15' },
  resKey: { fontSize: 10, color: '#7a7a9a', marginTop: 2, textTransform: 'capitalize' },
  heroCard: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 10, padding: 12, marginBottom: 10 },
  heroRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  heroName: { fontWeight: 700, fontSize: 15, color: '#e0d0ff' },
  heroClass: { fontSize: 12, color: '#7a7a9a' },
  heroStatus: { fontSize: 20 },
  heroAbility: { fontSize: 11, color: '#8888aa', marginBottom: 6 },
  abilityLabel: { color: '#c9b0ff', fontWeight: 600 },
  statsRow: { display: 'flex', gap: 12, fontSize: 12, color: '#aaa', marginBottom: 6 },
  hpBg: { height: 4, background: '#2a2a40', borderRadius: 2 },
  hpFill: { height: 4, borderRadius: 2 },
};
