import { useSystemStore } from '../../stores/systemStore';
import { useProcessStore } from '../../stores/processStore';

export function Header() {
  const connected = useSystemStore((s) => s.connected);
  const searchQuery = useProcessStore((s) => s.searchQuery);
  const setSearchQuery = useProcessStore((s) => s.setSearchQuery);

  return (
    <header
      className="flex items-center justify-between h-14 px-6 border-b shrink-0"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--bg-elevated)',
      }}
    >
      <h1 className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
        Process Visualizer
      </h1>

      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search processes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm border-none outline-none w-64"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
          }}
        />

        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{
              backgroundColor: connected ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </header>
  );
}
