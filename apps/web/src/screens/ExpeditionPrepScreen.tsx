import { useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import type { HeroDTO } from '@labyrinth/shared';

export function ExpeditionPrepScreen() {
  const { heroes, startExpedition, setScreen, loading, error } = useGameStore();
  const [selected, setSelected] = useState<string | null>(null);

  const aliveHeroes = heroes.filter((h) => h.isAlive);

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => setScreen('base')}>← Back</button>
      <h2 style={s.title}>⚔️ Choose Your Champion</h2>
      <p style={s.sub}>Select one hero for this expedition.</p>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.list}>
        {aliveHeroes.length === 0 && (
          <div style={s.empty}>All heroes are recovering. Wait or revive them from Base.</div>
        )}
        {aliveHeroes.map((h) => (
          <HeroCard
            key={h.id}
            hero={h}
            selected={selected === h.id}
            onSelect={() => setSelected(prev => prev === h.id ? null : h.id)}
          />
        ))}
      </div>

      <button
        style={{ ...s.startBtn, opacity: selected && !loading ? 1 : 0.4 }}
        disabled={!selected || loading}
        onClick={() => selected && startExpedition([selected])}
      >
        {loading ? 'Entering labyrinth...' : 'Enter Labyrinth'}
      </button>
    </div>
  );
}

function HeroCard({ hero, selected, onSelect }: { hero: HeroDTO; selected: boolean; onSelect: () => void }) {
  const hpPct = Math.round((hero.stats.hp / hero.stats.maxHp) * 100);
  return (
    <div
      style={{ ...s.card, borderColor: selected ? '#c9b0ff' : '#2a2a40', background: selected ? '#1e1035' : '#1a1a2e' }}
      onClick={onSelect}
    >
      <div style={s.portraitRow}>
        <img
          src={`${import.meta.env.BASE_URL}heroes/${hero.class}.png`}
          alt={hero.class}
          style={s.portrait}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div style={s.cardRow}>
        <div>
          <div style={s.heroName}>{hero.name}</div>
          <div style={s.heroClass}>{hero.class} · Lv {hero.level}</div>
        </div>
        <div style={s.radio}>{selected ? '🔵' : '⚪'}</div>
      </div>
      <div style={s.stats}>
        <span>❤️ {hero.stats.hp}/{hero.stats.maxHp}</span>
        <span>⚔️ {hero.stats.attack}</span>
        <span>🛡️ {hero.stats.defense}</span>
        <span>💨 {hero.stats.speed}</span>
      </div>
      <div style={s.hpBg}>
        <div style={{ ...s.hpFill, width: `${hpPct}%`, background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#f87171' }} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  back: { background: 'none', border: 'none', color: '#8888cc', cursor: 'pointer', fontSize: 14, marginBottom: 12, padding: 0 },
  title: { fontSize: 20, fontWeight: 700, color: '#c9b0ff', marginBottom: 6 },
  sub: { color: '#8888aa', fontSize: 13, marginBottom: 16 },
  error: { background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8, padding: 10, marginBottom: 12, color: '#f87171', fontSize: 13 },
  list: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 },
  empty: { color: '#7a7a9a', fontSize: 14, padding: 20, textAlign: 'center' },
  card: { border: '2px solid', borderRadius: 10, padding: 12, cursor: 'pointer', transition: 'all 0.15s' },
  cardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  heroName: { fontWeight: 700, fontSize: 15, color: '#e0d0ff' },
  heroClass: { fontSize: 12, color: '#7a7a9a', textTransform: 'capitalize' },
  radio: { fontSize: 20 },
  stats: { display: 'flex', gap: 12, fontSize: 12, color: '#aaa', marginBottom: 8 },
  hpBg: { height: 4, background: '#2a2a40', borderRadius: 2 },
  hpFill: { height: 4, borderRadius: 2, transition: 'width 0.3s' },
  startBtn: { width: '100%', padding: '14px 0', background: '#5b3a9c', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  portraitRow: { display: 'flex', justifyContent: 'center', marginBottom: 8 },
  portrait: { width: 80, height: 80, objectFit: 'cover', borderRadius: 8 },
};
