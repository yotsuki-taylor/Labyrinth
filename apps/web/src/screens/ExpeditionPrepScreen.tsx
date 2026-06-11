import { useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import type { HeroDTO } from '@labyrinth/shared';

export function ExpeditionPrepScreen() {
  const { heroes, startExpedition, setScreen, loading, error } = useGameStore();
  const [selected, setSelected] = useState<string[]>([]);

  const aliveHeroes = heroes.filter((h) => h.isAlive);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => setScreen('base')}>← Back</button>
      <h2 style={s.title}>⚔️ Expedition Prep</h2>
      <p style={s.sub}>Choose your heroes for this run. Select at least 1.</p>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.list}>
        {aliveHeroes.length === 0 && (
          <div style={s.empty}>All heroes are dead. Wait for them to recover (TODO: recovery mechanic).</div>
        )}
        {aliveHeroes.map((h) => (
          <HeroCard key={h.id} hero={h} selected={selected.includes(h.id)} onToggle={() => toggle(h.id)} />
        ))}
      </div>

      <button
        style={{ ...s.startBtn, opacity: selected.length > 0 && !loading ? 1 : 0.4 }}
        disabled={selected.length === 0 || loading}
        onClick={() => startExpedition(selected)}
      >
        {loading ? 'Entering labyrinth...' : `Enter Labyrinth (${selected.length} heroes)`}
      </button>
    </div>
  );
}

function HeroCard({ hero, selected, onToggle }: { hero: HeroDTO; selected: boolean; onToggle: () => void }) {
  const hpPercent = Math.round((hero.stats.hp / hero.stats.maxHp) * 100);
  return (
    <div style={{ ...s.card, borderColor: selected ? '#7b5ea7' : '#2a2a40', background: selected ? '#22163a' : '#1a1a2e' }} onClick={onToggle}>
      <div style={s.cardRow}>
        <div>
          <div style={s.heroName}>{hero.name}</div>
          <div style={s.heroClass}>{hero.class} · Lv {hero.level}</div>
        </div>
        <div style={s.checkbox}>{selected ? '✅' : '⬜'}</div>
      </div>
      <div style={s.stats}>
        <span>❤️ {hero.stats.hp}/{hero.stats.maxHp}</span>
        <span>⚔️ {hero.stats.attack}</span>
        <span>🛡️ {hero.stats.defense}</span>
        <span>💨 {hero.stats.speed}</span>
      </div>
      <div style={s.hpBarBg}>
        <div style={{ ...s.hpBar, width: `${hpPercent}%`, background: hpPercent > 50 ? '#4ade80' : hpPercent > 25 ? '#facc15' : '#f87171' }} />
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
  checkbox: { fontSize: 20 },
  stats: { display: 'flex', gap: 12, fontSize: 12, color: '#aaa', marginBottom: 8 },
  hpBarBg: { height: 4, background: '#2a2a40', borderRadius: 2 },
  hpBar: { height: 4, borderRadius: 2, transition: 'width 0.3s' },
  startBtn: { width: '100%', padding: '14px 0', background: '#5b3a9c', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
};
