import { useGameStore } from '../store/gameStore.js';

const RES_ICON: Record<string, string> = {
  gold: '🪙', stone: '🪨', iron: '⚙️', essence: '✨', relics: '🔮',
};

export function ResultsScreen() {
  const { lastResult, resources, setScreen } = useGameStore();

  const success = lastResult?.success ?? false;
  const loot = lastResult?.loot ?? {};
  const hasLoot = Object.values(loot).some((v) => (v ?? 0) > 0);

  if (!success) {
    return (
      <div style={fail.page}>
        <div style={fail.bg} aria-hidden />

        <div style={fail.body}>
          <div style={fail.skull}>💀</div>
          <h1 style={fail.title}>EXPEDITION FAILED</h1>
          <p style={fail.msg}>{lastResult?.message ?? 'Your hero fell in the labyrinth.'}</p>
          <p style={fail.sub}>All loot collected this run has been lost.</p>
        </div>

        <button style={fail.btn} onClick={() => setScreen('base')}>
          🏰 Return to Hub
        </button>
      </div>
    );
  }

  return (
    <div style={win.page}>
      <div style={{ textAlign: 'center', padding: '30px 0 20px' }}>
        <div style={win.icon}>🏆</div>
        <h2 style={win.title}>Extraction Successful!</h2>
        <p style={win.msg}>{lastResult?.message}</p>
      </div>

      {hasLoot && (
        <div style={win.lootBox}>
          <div style={win.lootTitle}>Loot Secured</div>
          {(Object.entries(loot) as [string, number][])
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <div key={k} style={win.lootRow}>
                <span style={win.lootKey}>{RES_ICON[k] ?? '•'} {k}</span>
                <span style={win.lootVal}>+{v}</span>
              </div>
            ))}
        </div>
      )}

      <div style={win.totalBox}>
        <div style={win.totalTitle}>Current Balance</div>
        {(Object.entries(resources) as [string, number][]).map(([k, v]) => (
          <div key={k} style={win.lootRow}>
            <span style={win.lootKey}>{RES_ICON[k] ?? '•'} {k}</span>
            <span style={{ color: '#ccd6f6' }}>{v}</span>
          </div>
        ))}
      </div>

      <button style={win.btn} onClick={() => setScreen('base')}>
        🏰 Return to Base
      </button>
    </div>
  );
}

const fail: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '60px 24px 32px',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
    background: '#0a0408',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at 50% 35%, #3b0a0a 0%, #0a0408 60%)',
    zIndex: 0,
  },
  body: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    textAlign: 'center',
  },
  skull: {
    fontSize: 80,
    lineHeight: 1,
    filter: 'drop-shadow(0 0 28px #ef4444aa)',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: '0.12em',
    color: '#f87171',
    textShadow: '0 0 24px #ef4444, 0 2px 0 #1a0000',
    margin: 0,
  },
  msg: {
    color: '#c0a0a0',
    fontSize: 15,
    margin: '8px 0 0',
    maxWidth: 300,
    lineHeight: 1.5,
  },
  sub: {
    color: '#6a4040',
    fontSize: 13,
    margin: 0,
  },
  btn: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 320,
    padding: '15px 0',
    background: '#3b1a1a',
    border: '1px solid #7f1d1d',
    borderRadius: 14,
    color: '#fca5a5',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
};

const win: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 480, margin: '0 auto' },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#4ade80' },
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
