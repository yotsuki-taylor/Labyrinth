import { useGameStore } from '../store/gameStore.js';

export function ResultsScreen() {
  const { lastResult, resources, setScreen } = useGameStore();

  const loot = lastResult?.loot ?? {};
  const hasLoot = Object.values(loot).some((v) => (v ?? 0) > 0);

  return (
    <div style={s.page}>
      <div style={{ textAlign: 'center', padding: '30px 0 20px' }}>
        <div style={s.icon}>{lastResult?.success ? '🏆' : '💀'}</div>
        <h2 style={{ ...s.title, color: lastResult?.success ? '#4ade80' : '#f87171' }}>
          {lastResult?.success ? 'Extraction Successful!' : 'Run Failed'}
        </h2>
        <p style={s.msg}>{lastResult?.message}</p>
      </div>

      {hasLoot && (
        <div style={s.lootBox}>
          <div style={s.lootTitle}>Loot Secured:</div>
          {(Object.entries(loot) as [string, number][])
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <div key={k} style={s.lootRow}>
                <span style={s.lootKey}>{k}</span>
                <span style={s.lootVal}>+{v}</span>
              </div>
            ))}
        </div>
      )}

      <div style={s.totalBox}>
        <div style={s.totalTitle}>Current Balance:</div>
        {(Object.entries(resources) as [string, number][]).map(([k, v]) => (
          <div key={k} style={s.lootRow}>
            <span style={s.lootKey}>{k}</span>
            <span style={{ color: '#ccd6f6' }}>{v}</span>
          </div>
        ))}
      </div>

      <button style={s.btn} onClick={() => setScreen('base')}>
        🏰 Return to Base
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  msg: { color: '#8888aa', fontSize: 14 },
  lootBox: { background: '#0d2a1a', border: '1px solid #166534', borderRadius: 10, padding: '12px 16px', marginTop: 20, marginBottom: 12 },
  lootTitle: { fontSize: 12, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  lootRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 14 },
  lootKey: { color: '#8888aa', textTransform: 'capitalize' },
  lootVal: { color: '#4ade80', fontWeight: 700 },
  totalBox: { background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 10, padding: '12px 16px', marginBottom: 20 },
  totalTitle: { fontSize: 12, color: '#7a7a9a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  btn: { width: '100%', padding: '14px 0', background: '#5b3a9c', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
};
