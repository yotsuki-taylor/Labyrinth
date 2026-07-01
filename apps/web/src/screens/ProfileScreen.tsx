import { useGameStore } from '../store/gameStore.js';
import { HERO_TEMPLATES } from '@labyrinth/shared';
import type { HeroClass } from '@labyrinth/shared';

const RES_LABELS: Record<string, string> = {
  gold: '🪙', stone: '🪨', iron: '⚙️', essence: '✨', relics: '🏺',
};

export function ProfileScreen() {
  const { username, resources, heroes, stats, setScreen } = useGameStore();

  const totalRuns = stats.runsExtracted + stats.runsFailed;
  const survival = totalRuns > 0 ? Math.round((stats.runsExtracted / totalRuns) * 100) : 0;

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

      <div style={s.sectionTitle}>Statistics</div>
      <div style={s.statGrid}>
        <StatCard icon="🏁" val={stats.runsStarted} label="Runs" />
        <StatCard icon="🚪" val={stats.runsExtracted} label="Extractions" />
        <StatCard icon="💀" val={stats.runsFailed} label="Deaths" />
        <StatCard icon="📈" val={`${survival}%`} label="Survival" />
        <StatCard icon="🗺️" val={stats.roomsExplored} label="Rooms" />
        <StatCard icon="⬇️" val={stats.deepestDepth} label="Deepest" />
        <StatCard icon="⚔️" val={stats.monstersSlain} label="Monsters" />
        <StatCard icon="👹" val={stats.bossesSlain} label="Bosses" />
        <StatCard icon="🔮" val={stats.abilitiesGained} label="Abilities" />
      </div>

      {Object.values(stats.lootExtracted).some((v) => (v ?? 0) > 0) && (
        <>
          <div style={s.sectionTitle}>Lifetime Loot Extracted</div>
          <div style={s.lootRow}>
            {(Object.entries(stats.lootExtracted) as [string, number][])
              .filter(([, v]) => (v ?? 0) > 0)
              .map(([k, v]) => (
                <div key={k} style={s.lootChip}>
                  <span>{RES_LABELS[k] ?? '•'}</span>
                  <span style={s.lootVal}>{v}</span>
                </div>
              ))}
          </div>
        </>
      )}

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
              <div style={{ textAlign: 'center' }}>
                <img
                  src={`${import.meta.env.BASE_URL}heroes/${h.class}.png`}
                  alt={h.class}
                  style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, display: 'block', marginBottom: 2 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={s.heroStatus}>{h.isAlive ? '✅' : '💀'}</div>
              </div>
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

function StatCard({ icon, val, label }: { icon: string; val: number | string; label: string }) {
  return (
    <div style={s.statCard}>
      <div style={s.statIconBig}>{icon}</div>
      <div style={s.statValBig}>{val}</div>
      <div style={s.statLabel}>{label}</div>
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

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 },
  statCard: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 10, padding: '10px 4px', textAlign: 'center' },
  statIconBig: { fontSize: 18, marginBottom: 2 },
  statValBig: { fontSize: 18, fontWeight: 700, color: '#e0d0ff' },
  statLabel: { fontSize: 10, color: '#7a7a9a', marginTop: 2 },

  lootRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  lootChip: { display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 8, padding: '6px 10px', fontSize: 14 },
  lootVal: { fontWeight: 700, color: '#facc15' },
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
