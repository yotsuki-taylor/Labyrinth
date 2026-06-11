import { useGameStore } from '../store/gameStore.js';
import type { CombatParticipantDTO } from '@labyrinth/shared';

export function CombatScreen() {
  const { combat, performCombatAction, loading, error } = useGameStore();

  if (!combat) return <div style={s.page}><p style={{ color: '#8888aa' }}>No active combat.</p></div>;

  const heroes = combat.participants.filter((p) => p.type === 'hero');
  const enemies = combat.participants.filter((p) => p.type === 'enemy');
  const activeEnemy = enemies.find((e) => e.isAlive);
  const latestLog = combat.log.slice(-3);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>⚔️ Combat</h2>
        <div style={s.turn}>Turn {combat.turn}</div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Enemies */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Enemies</div>
        {enemies.map((e) => <ParticipantRow key={e.id} p={e} />)}
      </div>

      {/* Heroes */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Your Party</div>
        {heroes.map((h) => <ParticipantRow key={h.id} p={h} />)}
      </div>

      {/* Combat log */}
      <div style={s.log}>
        {latestLog.length === 0 && <div style={s.logEmpty}>Combat begins...</div>}
        {latestLog.map((entry, i) => (
          <div key={i} style={s.logEntry}>{entry.message}</div>
        ))}
      </div>

      {/* Actions */}
      {combat.status === 'active' && (
        <div style={s.actions}>
          <button
            style={{ ...s.actionBtn, background: '#5b1c1c', opacity: loading ? 0.5 : 1 }}
            disabled={loading || !activeEnemy}
            onClick={() => performCombatAction('attack', activeEnemy?.id)}
          >
            ⚔️ Attack
          </button>
          <button
            style={{ ...s.actionBtn, background: '#1a3b6e', opacity: loading ? 0.5 : 1 }}
            disabled={loading}
            onClick={() => performCombatAction('ability')}
          >
            ✨ Ability
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

      {combat.status !== 'active' && (
        <div style={{ ...s.outcome, background: combat.status === 'victory' ? '#14532d' : '#450a0a' }}>
          {combat.status === 'victory' ? '🏆 Victory!' : '💀 Defeated!'}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({ p }: { p: CombatParticipantDTO }) {
  const hpPct = Math.round((p.hp / p.maxHp) * 100);
  return (
    <div style={{ ...s.pRow, opacity: p.isAlive ? 1 : 0.4 }}>
      <div style={s.pName}>
        {p.isAlive ? '' : '💀 '}{p.name}
        <span style={s.pType}> [{p.type}]</span>
      </div>
      <div style={s.pStats}>
        <span>❤️ {p.hp}/{p.maxHp}</span>
        <span>⚔️ {p.attack}</span>
        <span>🛡️ {p.defense}</span>
      </div>
      <div style={s.hpBg}>
        <div style={{
          ...s.hpFill,
          width: `${hpPct}%`,
          background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#f87171',
        }} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, color: '#f87171' },
  turn: { fontSize: 13, color: '#7a7a9a', background: '#1a1a2e', padding: '4px 10px', borderRadius: 6 },
  error: { background: '#3b1a1a', border: '1px solid #f87171', borderRadius: 8, padding: 10, marginBottom: 12, color: '#f87171', fontSize: 13 },
  section: { marginBottom: 12 },
  sectionLabel: { fontSize: 11, color: '#7a7a9a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  pRow: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 8, padding: '8px 12px', marginBottom: 6 },
  pName: { fontSize: 14, fontWeight: 600, color: '#e0d0ff', marginBottom: 4 },
  pType: { color: '#5a5a7a', fontWeight: 400, fontSize: 11 },
  pStats: { display: 'flex', gap: 12, fontSize: 12, color: '#aaa', marginBottom: 6 },
  hpBg: { height: 5, background: '#2a2a40', borderRadius: 3 },
  hpFill: { height: 5, borderRadius: 3, transition: 'width 0.3s' },
  log: { background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: 10, marginBottom: 14, minHeight: 70 },
  logEmpty: { color: '#4a4a6a', fontSize: 13 },
  logEntry: { fontSize: 12, color: '#aaa', lineHeight: 1.6, borderBottom: '1px solid #1a1a2e', paddingBottom: 4, marginBottom: 4 },
  actions: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  actionBtn: { border: 'none', borderRadius: 10, color: '#fff', padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  outcome: { padding: 16, borderRadius: 10, textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#fff' },
};
