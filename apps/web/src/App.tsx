import { useEffect } from 'react';
import { useGameStore } from './store/gameStore.js';
import { ResourceBar } from './components/ResourceBar.js';
import { StartMenuScreen } from './screens/StartMenuScreen.js';
import { BaseScreen } from './screens/BaseScreen.js';
import { ExpeditionPrepScreen } from './screens/ExpeditionPrepScreen.js';
import { LabyrinthRunScreen } from './screens/LabyrinthRunScreen.js';
import { CombatScreen } from './screens/CombatScreen.js';
import { ResultsScreen } from './screens/ResultsScreen.js';
import { ProfileScreen } from './screens/ProfileScreen.js';

export function App() {
  const { screen, resources, loading, loadPlayerState } = useGameStore();

  useEffect(() => {
    // Init Telegram WebApp
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
    loadPlayerState();
  }, []);

  if (loading && screen === 'base' && !resources.gold && !resources.stone) {
    return (
      <div style={loadingStyle}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏰</div>
        <div style={{ color: '#c9b0ff', fontSize: 16 }}>Entering the Labyrinth...</div>
      </div>
    );
  }

  if (screen === 'start') {
    return <StartMenuScreen />;
  }

  return (
    <div style={appStyle}>
      {screen !== 'results' && screen !== 'combat' && screen !== 'labyrinth_run' && (
        <ResourceBar resources={resources} />
      )}
      {screen === 'base' && <BaseScreen />}
      {screen === 'expedition_prep' && <ExpeditionPrepScreen />}
      {screen === 'labyrinth_run' && <LabyrinthRunScreen />}
      {screen === 'combat' && <CombatScreen />}
      {screen === 'results' && <ResultsScreen />}
      {screen === 'profile' && <ProfileScreen />}
    </div>
  );
}

const appStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0d0d1a',
  color: '#e8e8f0',
};

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#0d0d1a',
};
