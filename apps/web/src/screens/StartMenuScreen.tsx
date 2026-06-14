import { useState } from 'react';
import { useGameStore } from '../store/gameStore.js';

export function StartMenuScreen() {
  const { hasSave, setScreen, newGame, loading } = useGameStore();
  const [confirming, setConfirming] = useState(false);

  function handleContinue() {
    setScreen('base');
  }

  function handleNewGame() {
    if (hasSave && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    newGame();
  }

  return (
    <div style={s.page}>
      <div style={s.bg} aria-hidden />

      <div style={s.hero}>
        <div style={s.emblem}>🏰</div>
        <h1 style={s.title}>LABYRINTH</h1>
        <p style={s.tagline}>Delve deep. Claim the loot. Survive.</p>
      </div>

      <div style={s.buttons}>
        {hasSave && (
          <button style={{ ...s.btn, ...s.btnContinue }} onClick={handleContinue} disabled={loading}>
            ▶ Continue
          </button>
        )}

        {confirming ? (
          <div style={s.confirmBox}>
            <p style={s.confirmText}>Starting a new game will erase your current save. Are you sure?</p>
            <div style={s.confirmRow}>
              <button style={{ ...s.btn, ...s.btnDanger }} onClick={handleNewGame} disabled={loading}>
                {loading ? '...' : 'Yes, start over'}
              </button>
              <button style={{ ...s.btn, ...s.btnCancel }} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button style={{ ...s.btn, ...s.btnNew }} onClick={handleNewGame} disabled={loading}>
            {loading ? '...' : hasSave ? '✦ New Game' : '✦ Start Game'}
          </button>
        )}
      </div>

      <div style={s.footer}>
        <span style={s.footerText}>v0.1 · Roguelite · Client-side</span>
      </div>
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
    background: '#0d0d1a',
    padding: '40px 24px 24px',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(ellipse at 50% 30%, #2a1060 0%, #0d0d1a 65%)',
    zIndex: 0,
  },
  hero: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginTop: 40,
  },
  emblem: {
    fontSize: 72,
    lineHeight: 1,
    filter: 'drop-shadow(0 0 24px #9b50ff88)',
    marginBottom: 8,
  },
  title: {
    fontSize: 42,
    fontWeight: 900,
    letterSpacing: '0.18em',
    color: '#e2d4ff',
    textShadow: '0 0 32px #7c3aed, 0 2px 0 #1a0040',
    margin: 0,
  },
  tagline: {
    fontSize: 13,
    color: '#8878aa',
    letterSpacing: '0.08em',
    margin: 0,
    fontStyle: 'italic',
  },

  buttons: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  btn: {
    width: '100%',
    padding: '15px 0',
    borderRadius: 14,
    border: 'none',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'opacity 0.15s, transform 0.1s',
  },
  btnContinue: {
    background: 'linear-gradient(135deg, #5b3a9c, #8b5cf6)',
    color: '#fff',
    boxShadow: '0 4px 20px #5b3a9c88',
  },
  btnNew: {
    background: 'transparent',
    border: '2px solid #3a2a5c',
    color: '#b090e0',
  },
  btnDanger: {
    background: '#7f1d1d',
    color: '#fca5a5',
    flex: 1,
  },
  btnCancel: {
    background: '#1e1b2e',
    color: '#9080b0',
    flex: 1,
    border: '1px solid #3a2a5c',
  },

  confirmBox: {
    background: '#130f24',
    border: '1px solid #4a2a6c',
    borderRadius: 14,
    padding: '14px 16px',
  },
  confirmText: {
    color: '#c0a8e0',
    fontSize: 13,
    lineHeight: 1.5,
    margin: '0 0 12px',
    textAlign: 'center',
  },
  confirmRow: {
    display: 'flex',
    gap: 10,
  },

  footer: {
    position: 'relative',
    zIndex: 1,
  },
  footerText: {
    fontSize: 11,
    color: '#3a3050',
    letterSpacing: '0.06em',
  },
};
