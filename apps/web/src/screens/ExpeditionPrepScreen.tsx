import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { HERO_TEMPLATES } from '@labyrinth/shared';
import type { HeroDTO } from '@labyrinth/shared';

export function ExpeditionPrepScreen() {
  const { heroes, startExpedition, setScreen, loading, error } = useGameStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [scroll, setScroll] = useState({ prog: 0, thumbW: 0.5 });
  const listRef = useRef<HTMLDivElement>(null);

  const aliveHeroes = heroes.filter((h) => h.isAlive);

  // Compute initial thumb size once the list mounts / heroes change.
  useEffect(() => {
    const el = listRef.current;
    if (el) setScroll(s => ({ ...s, thumbW: Math.min(1, el.clientWidth / el.scrollWidth) }));
  }, [aliveHeroes.length]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const max = el.scrollWidth - el.clientWidth;
    setScroll({
      prog: max > 0 ? el.scrollLeft / max : 0,
      thumbW: Math.min(1, el.clientWidth / el.scrollWidth),
    });
  }

  const showScrollbar = scroll.thumbW < 0.99;
  // thumb left = prog * (1 - thumbW) expressed as % of track width
  const thumbLeft = scroll.prog * (1 - scroll.thumbW) * 100;

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => setScreen('base')}>← Back</button>
      <h2 style={s.title}>⚔️ Choose Your Champion</h2>
      <p style={s.sub}>Swipe to browse heroes. Tap a card to select.</p>

      {error && <div style={s.error}>{error}</div>}

      <div ref={listRef} style={s.list} onScroll={handleScroll}>
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

      {showScrollbar && (
        <div style={s.scrollTrack}>
          <div style={{ ...s.scrollThumb, width: `${scroll.thumbW * 100}%`, left: `${thumbLeft}%` }} />
        </div>
      )}

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
  const tpl = HERO_TEMPLATES[hero.class];
  return (
    <div
      style={{
        ...s.card,
        borderColor: selected ? '#c9b0ff' : '#2a2a40',
        background: selected ? '#1e1035' : '#1a1a2e',
        boxShadow: selected ? '0 0 12px #7c3aed55' : 'none',
      }}
      onClick={onSelect}
    >
      <div style={s.portraitWrap}>
        <img
          src={`${import.meta.env.BASE_URL}heroes/${hero.class}.png`}
          alt={hero.class}
          style={s.portrait}
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = 'none';
            (el.parentElement as HTMLElement).style.background = '#2a1a4a';
          }}
        />
        <div style={s.levelBadge}>Lv {hero.level}</div>
        {selected && <div style={s.selectedBadge}>✓</div>}
      </div>

      <div style={s.body}>
        <div style={s.heroName}>{hero.name}</div>
        <div style={s.heroClass}>{tpl.label}</div>

        <div style={s.divider} />

        <div style={s.abilityLabel}>Ability</div>
        <div style={s.abilityText}>{tpl.ability}</div>

        <div style={s.divider} />

        <div style={s.statsGrid}>
          <div style={s.statItem}><span style={s.statIcon}>❤️</span><span style={s.statVal}>{hero.stats.maxHp}</span></div>
          <div style={s.statItem}><span style={s.statIcon}>⚔️</span><span style={s.statVal}>{hero.stats.attack}</span></div>
          <div style={s.statItem}><span style={s.statIcon}>🛡️</span><span style={s.statVal}>{hero.stats.defense}</span></div>
          <div style={s.statItem}><span style={s.statIcon}>💨</span><span style={s.statVal}>{hero.stats.speed}</span></div>
        </div>

        <div style={s.hpRow}>
          <span style={s.hpLabel}>HP {hero.stats.hp}/{hero.stats.maxHp}</span>
        </div>
        <div style={s.hpBg}>
          <div style={{
            ...s.hpFill,
            width: `${hpPct}%`,
            background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#f87171',
          }} />
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100dvh', boxSizing: 'border-box' },
  back: { background: 'none', border: 'none', color: '#8888cc', cursor: 'pointer', fontSize: 14, marginBottom: 12, padding: 0, alignSelf: 'flex-start' },
  title: { fontSize: 20, fontWeight: 700, color: '#c9b0ff', marginBottom: 4 },
  sub: { color: '#8888aa', fontSize: 13, marginBottom: 16 },
  error: { background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8, padding: 10, marginBottom: 12, color: '#f87171', fontSize: 13 },

  list: {
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: 4,
    marginBottom: 10,
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  } as React.CSSProperties,

  scrollTrack: {
    position: 'relative',
    height: 4,
    background: '#1e1a30',
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  scrollThumb: {
    position: 'absolute',
    top: 0,
    height: '100%',
    background: 'linear-gradient(90deg, #5b3a9c, #8b5cf6)',
    borderRadius: 2,
    transition: 'left 0.12s ease-out, width 0.15s',
  },

  empty: { color: '#7a7a9a', fontSize: 14, padding: 20, textAlign: 'center', flex: 1 },

  card: {
    flexShrink: 0,
    width: 180,
    border: '2px solid',
    borderRadius: 14,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    scrollSnapAlign: 'start',
  },

  portraitWrap: {
    position: 'relative',
    width: '100%',
    height: 288,
    background: '#12102a',
    overflow: 'hidden',
  },
  portrait: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'center bottom',
    display: 'block',
  },
  levelBadge: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    background: '#0008',
    color: '#c9b0ff',
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 6,
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    background: '#7c3aed',
    color: '#fff',
    fontSize: 13,
    fontWeight: 900,
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { padding: '10px 12px 12px' },
  heroName: { fontWeight: 700, fontSize: 15, color: '#e0d0ff', marginBottom: 2 },
  heroClass: { fontSize: 11, color: '#7a7a9a', textTransform: 'capitalize', marginBottom: 0 },

  divider: { height: 1, background: '#2a2a40', margin: '8px 0' },

  abilityLabel: { fontSize: 10, fontWeight: 700, color: '#9b7fd4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 },
  abilityText: { fontSize: 11, color: '#c4b5e0', lineHeight: 1.4, fontStyle: 'italic' },

  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', marginBottom: 8 },
  statItem: { display: 'flex', alignItems: 'center', gap: 4 },
  statIcon: { fontSize: 11 },
  statVal: { fontSize: 12, color: '#b0a0d0', fontWeight: 600 },

  hpRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 },
  hpLabel: { fontSize: 10, color: '#7a7a9a' },
  hpBg: { height: 4, background: '#2a2a40', borderRadius: 2 },
  hpFill: { height: 4, borderRadius: 2, transition: 'width 0.3s' },

  startBtn: { width: '100%', padding: '14px 0', background: '#5b3a9c', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 'auto' },
};
