import { useGameStore } from '../store/gameStore.js';

const RES_ICON: Record<string, string> = {
  gold: '🪙', stone: '🪨', iron: '⚙️', essence: '✨', relics: '🔮',
};

export function ResultsScreen() {
  const { lastResult, resources, setScreen } = useGameStore();

  const success = lastResult?.success ?? false;
  const loot = lastResult?.loot ?? {};
  const lootEntries = (Object.entries(loot) as [string, number][]).filter(([, v]) => v > 0);

  if (!success) {
    return (
      <div style={s.page}>
        <div style={{ ...s.bg, background: 'radial-gradient(ellipse at 50% 35%, #3b0a0a 0%, #0a0408 60%)' }} aria-hidden />

        <div style={s.body}>
          <div style={{ ...s.bigIcon, filter: 'drop-shadow(0 0 28px #ef4444aa)' }}>💀</div>
          <h1 style={{ ...s.title, color: '#f87171', textShadow: '0 0 24px #ef4444, 0 2px 0 #1a0000' }}>
            EXPEDITION FAILED
          </h1>
          <p style={{ ...s.msg, color: '#c0a0a0' }}>{lastResult?.message ?? 'Your hero fell in the labyrinth.'}</p>
          <p style={{ ...s.sub, color: '#6a4040' }}>All loot collected this run has been lost.</p>
        </div>

        <button style={{ ...s.btn, background: '#3b1a1a', border: '1px solid #7f1d1d', color: '#fca5a5' }}
          onClick={() => setScreen('base')}>
          🏰 Return to Hub
        </button>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={{ ...s.bg, background: 'radial-gradient(ellipse at 50% 35%, #052e16 0%, #070f0a 60%)' }} aria-hidden />

      <div style={s.body}>
        <div style={{ ...s.bigIcon, filter: 'drop-shadow(0 0 28px #4ade80aa)' }}>🏆</div>
        <h1 style={{ ...s.title, color: '#4ade80', textShadow: '0 0 24px #16a34a, 0 2px 0 #001a06' }}>
          EXTRACTION COMPLETE
        </h1>
        <p style={{ ...s.msg, color: '#a0c0a8' }}>{lastResult?.message ?? 'You made it out alive!'}</p>

        {lootEntries.length > 0 && (
          <div style={s.lootBox}>
            <div style={{ ...s.boxTitle, color: '#4ade80', borderColor: '#166534' }}>Loot Secured</div>
            {lootEntries.map(([k, v]) => (
              <div key={k} style={s.row}>
                <span style={s.rowKey}>{RES_ICON[k] ?? '•'} {k}</span>
                <span style={{ color: '#4ade80', fontWeight: 700 }}>+{v}</span>
              </div>
            ))}
          </div>
        )}

        <div style={s.lootBox}>
          <div style={{ ...s.boxTitle, color: '#9b7fd4', borderColor: '#3a2a5c' }}>Current Balance</div>
          {(Object.entries(resources) as [string, number][]).map(([k, v]) => (
            <div key={k} style={s.row}>
              <span style={s.rowKey}>{RES_ICON[k] ?? '•'} {k}</span>
              <span style={{ color: '#ccd6f6' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <button style={{ ...s.btn, background: '#14532d', border: '1px solid #166534', color: '#86efac' }}
        onClick={() => setScreen('base')}>
        🏰 Return to Hub
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '56px 24px 32px',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
    background: '#07090a',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
  },
  body: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center',
    width: '100%',
    maxWidth: 340,
  },
  bigIcon: {
    fontSize: 80,
    lineHeight: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: '0.10em',
    margin: '0 0 4px',
  },
  msg: {
    fontSize: 14,
    margin: '0 0 4px',
    lineHeight: 1.5,
    maxWidth: 280,
  },
  sub: {
    fontSize: 12,
    margin: 0,
  },
  lootBox: {
    width: '100%',
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid',
    borderRadius: 12,
    padding: '10px 14px',
    marginTop: 6,
  },
  boxTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 8,
    borderBottom: '1px solid',
    paddingBottom: 6,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: 13,
  },
  rowKey: {
    color: '#7a8a80',
    textTransform: 'capitalize' as const,
  },
  btn: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 320,
    padding: '15px 0',
    borderRadius: 14,
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
};
