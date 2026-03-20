import { useState, useRef, useEffect } from 'react';
import { useSystemStore } from '../../stores/systemStore';
import { useProcessStore } from '../../stores/processStore';
import { sendWsMessage } from '../../hooks/useWebSocket';
import { ThemeToggle } from '../common/ThemeToggle';
import { exportProcessesCSV, exportProcessesJSON, exportSystemJSON } from '../../utils/export';
import { AlertSettings } from '../AlertSettings';

const INTERVAL_OPTIONS = [
  { value: 100, label: '100ms (Fastest)' },
  { value: 250, label: '250ms' },
  { value: 500, label: '500ms' },
  { value: 1000, label: '1s (Default)' },
  { value: 2000, label: '2s' },
  { value: 5000, label: '5s (Slowest)' },
];

export function Header() {
  const connected = useSystemStore((s) => s.connected);
  const refreshInterval = useSystemStore((s) => s.refreshInterval);
  const setRefreshInterval = useSystemStore((s) => s.setRefreshInterval);
  const searchQuery = useProcessStore((s) => s.searchQuery);
  const setSearchQuery = useProcessStore((s) => s.setSearchQuery);

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!exportOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);

  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ms = Number(e.target.value);
    setRefreshInterval(ms);
    sendWsMessage({ action: 'set_interval', interval_ms: ms });
  };

  const handleExportProcessesCSV = () => {
    const processes = useProcessStore.getState().sortedProcesses();
    exportProcessesCSV(processes);
    setExportOpen(false);
  };

  const handleExportProcessesJSON = () => {
    const processes = useProcessStore.getState().sortedProcesses();
    exportProcessesJSON(processes);
    setExportOpen(false);
  };

  const handleExportSystemJSON = () => {
    const { system, history } = useSystemStore.getState();
    exportSystemJSON(system, history);
    setExportOpen(false);
  };

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

        <div className="flex items-center gap-2">
          <label
            htmlFor="refresh-interval"
            className="text-xs whitespace-nowrap"
            style={{ color: 'var(--text-muted)' }}
          >
            Refresh
          </label>
          <select
            id="refresh-interval"
            value={refreshInterval}
            onChange={handleIntervalChange}
            className="rounded-lg px-2 py-1.5 text-sm border-none outline-none cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              appearance: 'auto',
            }}
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Export dropdown */}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setExportOpen((prev) => !prev)}
            className="rounded-lg px-3 py-1.5 text-sm border-none outline-none cursor-pointer flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: exportOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {exportOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                minWidth: '220px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--bg-surface)',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={handleExportProcessesCSV}
                className="w-full text-left text-sm px-4 py-2.5 border-none outline-none cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  display: 'block',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                Export Processes (CSV)
              </button>
              <button
                onClick={handleExportProcessesJSON}
                className="w-full text-left text-sm px-4 py-2.5 border-none outline-none cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  display: 'block',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                Export Processes (JSON)
              </button>
              <div
                style={{
                  height: '1px',
                  backgroundColor: 'var(--bg-surface)',
                  margin: '0',
                }}
              />
              <button
                onClick={handleExportSystemJSON}
                className="w-full text-left text-sm px-4 py-2.5 border-none outline-none cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  display: 'block',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                Export System Data (JSON)
              </button>
            </div>
          )}
        </div>

        <AlertSettings />
        <ThemeToggle />

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
