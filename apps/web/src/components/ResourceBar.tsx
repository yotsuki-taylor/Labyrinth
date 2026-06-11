import type { ResourceMap } from '@labyrinth/shared';

const ICONS: Record<string, string> = {
  gold: '🪙',
  stone: '🪨',
  iron: '⚙️',
  essence: '✨',
  relics: '🔮',
};

export function ResourceBar({ resources }: { resources: ResourceMap }) {
  return (
    <div style={styles.bar}>
      {(Object.entries(resources) as [keyof ResourceMap, number][]).map(([key, val]) => (
        <span key={key} style={styles.item} title={key}>
          {ICONS[key]} {val}
        </span>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: 12,
    padding: '8px 16px',
    background: '#1a1a2e',
    borderBottom: '1px solid #2a2a40',
    flexWrap: 'wrap',
    fontSize: 13,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: '#ccd6f6',
  },
};
