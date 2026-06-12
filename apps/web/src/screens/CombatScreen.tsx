import { useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { HERO_TEMPLATES } from '@labyrinth/shared';
import type { CombatParticipantDTO, HeroClass } from '@labyrinth/shared';

export function CombatScreen() {
  const { combat, performCombatAction, loading, error } = useGameStore();
  const [targeting, setTargeting] = useState(false);

  if (!combat) return <div style={s.page}><p style={{ color: '#8888aa' }}>No active combat.</p></div>;

  const heroes = combat.participants.filter((p) => p.type === 'hero');
  const enemies = combat.participants.filter((p) => p.type === 'enemy');
  const aliveEnemies = enemies.filter((e) => e.isAlive);
  const latestLog = combat.log.slice(-3);

  const activeHero = heroes.find((h) => h.id === combat.activeParticipantId);
  const activeClass = (activeHero?.heroClass ?? 'warrior') as HeroClass;
  const abilityName = HERO_TEMPLATES[activeClass]?.ability.split('—')[0].trim() ?? 'Ability';

  function handleAttack() {
    if (aliveEnemies.length === 1) {
      performCombatAction('attack', aliveEnemies[0].id);
    } else {
      setTargeting(true);
    }
  }

  function handleTarget(enemyId: string) {
    setTargeting(false);
    performCombatAction('attack', enemyId);
  }

  // Turn order strip: participants sorted by speed (alive first, dead after)
  const turnOrder = [...combat.participants].sort((a, b) => {
    if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
    return b.speed - a.speed;
  });

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>⚔️ Combat</h2>
        <div style={s.turn}>Turn {combat.turn}</div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Initiative strip */}
      <div style={s.initiativeStrip}>
        {turnOrder.map((p) => (
          <div
            key={p.id}
            style={{
              ...s.initChip,
              opacity: p.isAlive ? 1 : 0.3,
              background: p.id === combat.activeParticipantId ? '#5b3a9c' : p.type === 'hero' ? '#1e2a4a' : '#3a1a1a',
              border: p.id === combat.activeParticipantId ? '1px solid #c9b0ff' : '1px solid #2a2a40',
            }}
          >
            <div style={s.initName}>{p.name.split(' ')[0]}</div>
            <div style={s.initSpd}>⚡{p.speed}</div>
          </div>
        ))}
      </div>

      {/* Enemies */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Enemies</div>
        <div style={s.participantGrid}>
          {enemies.map((e) => (
            <ParticipantCard
              key={e.id}
              p={e}
              isActive={false}
              showTargetBtn={targeting && e.isAlive}
              onTarget={() => handleTarget(e.id)}
            />
          ))}
        </div>
      </div>

      {/* Heroes */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Your Party</div>
        <div style={s.participantGrid}>
          {heroes.map((h) => (
            <ParticipantCard
              key={h.id}
              p={h}
              isActive={h.id === combat.activeParticipantId}
              showTargetBtn={false}
              onTarget={() => {}}
            />
          ))}
        </div>
      </div>

      {/* Combat log */}
      <div style={s.log}>
        {latestLog.length === 0 && <div style={s.logEmpty}>Combat begins...</div>}
        {latestLog.map((entry, i) => (
          <div key={i} style={s.logEntry}>{entry.message}</div>
        ))}
      </div>

      {/* Actions */}
      {combat.status === 'active' && !targeting && (
        <div style={s.actions}>
          <button
            style={{ ...s.actionBtn, background: '#5b1c1c', opacity: loading ? 0.5 : 1 }}
            disabled={loading || aliveEnemies.length === 0}
            onClick={handleAttack}
          >
            ⚔️ Attack
          </button>
          <button
            style={{ ...s.actionBtn, background: '#1a3b6e', opacity: loading ? 0.5 : 1 }}
            disabled={loading}
            onClick={() => performCombatAction('ability')}
          >
            ✨ {abilityName}
          </button>
          <button
            style={{ ...s.actionBtn, background: '#1a3a1a', opacity: loading ? 0.5 : 1 }}
            disabled={loading}
            onClick={() => performCombatAction('defend')}
          >
            🛡️ Defend
          </button>
        </div>
      )}

      {targeting && (
        <div style={s.targetingBanner}>
          Tap an enemy to attack — or{' '}
          <span style={s.cancelLink} onClick={() => setTargeting(false)}>cancel</span>
        </div>
      )}

      {combat.status !== 'active' && (
        <div style={{ ...s.outcome, background: combat.status === 'victory' ? '#14532d' : '#450a0a' }}>
          {combat.status === 'victory' ? '🏆 Victory!' : '💀 Defeated!'}
        </div>
      )}
    </div>
  );
}

function ParticipantCard({
  p, isActive, showTargetBtn, onTarget,
}: {
  p: CombatParticipantDTO;
  isActive: boolean;
  showTargetBtn: boolean;
  onTarget: () => void;
}) {
  const hpPct = Math.round((p.hp / p.maxHp) * 100);
  const imgSrc = p.type === 'hero' && p.heroClass
    ? `${import.meta.env.BASE_URL}heroes/${p.heroClass}.png`
    : p.enemyImage
    ? `${import.meta.env.BASE_URL}${p.enemyImage}`
    : null;

  return (
    <div
      style={{
        ...s.pCard,
        opacity: p.isAlive ? 1 : 0.35,
        borderColor: isActive ? '#c9b0ff' : showTargetBtn ? '#f87171' : '#2a2a40',
        cursor: showTargetBtn ? 'pointer' : 'default',
      }}
      onClick={showTargetBtn ? onTarget : undefined}
    >
      {imgSrc && (
        <img
          src={imgSrc}
          alt={p.name}
          style={s.pImg}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div style={s.pName}>
        {!p.isAlive && '💀 '}{p.name}
        {isActive && <span style={s.activeBadge}> ▶</span>}
      </div>
      <div style={s.pStats}>
        <span>❤️ {p.hp}/{p.maxHp}</span>
        <span>⚡{p.speed}</span>
      </div>
      <div style={s.hpBg}>
        <div style={{
          ...s.hpFill,
          width: `${hpPct}%`,
          background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#f87171',
        }} />
      </div>
      {showTargetBtn && (
        <div style={s.targetBtn}>▶ Target</div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 20, fontWeight: 700, color: '#f87171' },
  turn: { fontSize: 13, color: '#7a7a9a', background: '#1a1a2e', padding: '4px 10px', borderRadius: 6 },
  error: { background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8, padding: 10, marginBottom: 10, color: '#f87171', fontSize: 13 },
  initiativeStrip: { display: 'flex', gap: 6, overflowX: 'auto' as const, marginBottom: 12, paddingBottom: 4 },
  initChip: { borderRadius: 6, padding: '4px 8px', minWidth: 52, textAlign: 'center' as const, flexShrink: 0 },
  initName: { fontSize: 10, color: '#e0d0ff', fontWeight: 600, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  initSpd: { fontSize: 10, color: '#7a7a9a' },
  section: { marginBottom: 10 },
  sectionLabel: { fontSize: 11, color: '#7a7a9a', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6 },
  participantGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 },
  pCard: { background: '#1a1a2e', border: '1px solid', borderRadius: 8, padding: 8, transition: 'border-color 0.15s' },
  pImg: { width: '100%', aspectRatio: '1', objectFit: 'cover' as const, borderRadius: 6, marginBottom: 6, display: 'block' as const },
  pName: { fontSize: 12, fontWeight: 600, color: '#e0d0ff', marginBottom: 4 },
  activeBadge: { color: '#c9b0ff', fontWeight: 700 },
  pStats: { display: 'flex', gap: 8, fontSize: 11, color: '#aaa', marginBottom: 5 },
  hpBg: { height: 4, background: '#2a2a40', borderRadius: 2, marginBottom: 4 },
  hpFill: { height: 4, borderRadius: 2, transition: 'width 0.3s' },
  targetBtn: { textAlign: 'center' as const, background: '#5b1c1c', color: '#f87171', fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 0', marginTop: 4 },
  log: { background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: 10, marginBottom: 12, minHeight: 60 },
  logEmpty: { color: '#4a4a6a', fontSize: 13 },
  logEntry: { fontSize: 12, color: '#aaa', lineHeight: 1.5, borderBottom: '1px solid #1a1a2e', paddingBottom: 3, marginBottom: 3 },
  actions: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  actionBtn: { border: 'none', borderRadius: 10, color: '#fff', padding: '12px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  targetingBanner: { background: '#2a1515', border: '1px solid #f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171', textAlign: 'center' as const },
  cancelLink: { cursor: 'pointer', textDecoration: 'underline', color: '#f87171' },
  outcome: { padding: 16, borderRadius: 10, textAlign: 'center' as const, fontSize: 18, fontWeight: 700, color: '#fff' },
};
