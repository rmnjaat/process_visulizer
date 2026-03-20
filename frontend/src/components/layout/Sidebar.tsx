import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, List, GitBranch, Cpu, MemoryStick, Columns2, Pin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useProcessStore } from '../../stores/processStore';
import { formatBytes, formatPercent } from '../../utils/format';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/processes', label: 'Processes', icon: List },
  { path: '/tree', label: 'Process Tree', icon: GitBranch },
  { path: '/cpu', label: 'CPU Cores', icon: Cpu },
  { path: '/memory', label: 'Memory', icon: MemoryStick },
  { path: '/compare', label: 'Compare', icon: Columns2 },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const pinnedPids = useProcessStore((s) => s.pinnedPids);
  const processes = useProcessStore((s) => s.processes);
  const setSelectedPid = useProcessStore((s) => s.setSelectedPid);
  const togglePin = useProcessStore((s) => s.togglePin);

  // Resolve pinned PIDs to live process data (skip exited processes).
  const pinnedProcesses = [...pinnedPids]
    .map((pid) => processes[pid])
    .filter(Boolean);

  const handleWatchlistClick = (pid: number) => {
    setSelectedPid(pid);
    navigate('/processes');
  };

  return (
    <aside
      className="flex flex-col h-screen border-r transition-all duration-200 shrink-0"
      style={{
        width: expanded ? 240 : 60,
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--bg-elevated)',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        className="flex items-center justify-center h-14 border-b text-lg font-bold"
        style={{ borderColor: 'var(--bg-elevated)', color: 'var(--color-primary)' }}
      >
        {expanded ? 'PV' : 'P'}
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors no-underline"
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
              color: isActive ? '#fff' : 'var(--text-secondary)',
            })}
          >
            <item.icon size={18} className="shrink-0" />
            {expanded && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Watchlist section */}
      {expanded && pinnedProcesses.length > 0 && (
        <div className="flex flex-col mt-1" style={{ borderTop: '1px solid var(--bg-elevated)' }}>
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ color: 'var(--color-warning)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            <Pin size={12} fill="var(--color-warning)" />
            Watchlist
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 'auto' }}>
              {pinnedProcesses.length}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 px-1 pb-2 overflow-y-auto" style={{ maxHeight: 240 }}>
            {pinnedProcesses.map((proc) => (
              <div
                key={proc.pid}
                className="flex flex-col rounded-md px-2 py-1.5 cursor-pointer transition-colors"
                style={{ backgroundColor: 'transparent' }}
                onClick={() => handleWatchlistClick(proc.pid)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-xs truncate"
                    style={{ color: 'var(--text-primary)', fontWeight: 500, maxWidth: 140 }}
                  >
                    {proc.name}
                  </span>
                  <button
                    type="button"
                    title="Unpin"
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-warning)',
                      padding: 2,
                      lineHeight: 1,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(proc.pid);
                    }}
                  >
                    <Pin size={10} fill="var(--color-warning)" />
                  </button>
                </div>
                <div
                  className="flex items-center gap-2 mt-0.5"
                  style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'monospace' }}
                >
                  <span>PID {proc.pid}</span>
                  <span>{formatPercent(proc.cpu_percent)}</span>
                  <span>{formatBytes(proc.memory_rss_bytes)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed watchlist indicator */}
      {!expanded && pinnedProcesses.length > 0 && (
        <div
          className="flex items-center justify-center py-2"
          style={{ borderTop: '1px solid var(--bg-elevated)' }}
          title={`${pinnedProcesses.length} pinned process${pinnedProcesses.length === 1 ? '' : 'es'}`}
        >
          <div className="relative">
            <Pin size={18} style={{ color: 'var(--color-warning)' }} fill="var(--color-warning)" />
            <span
              className="absolute flex items-center justify-center rounded-full"
              style={{
                top: -4,
                right: -6,
                width: 14,
                height: 14,
                fontSize: 9,
                fontWeight: 700,
                backgroundColor: 'var(--color-warning)',
                color: 'var(--bg-primary)',
              }}
            >
              {pinnedProcesses.length}
            </span>
          </div>
        </div>
      )}

      {/* Spacer to push content to top */}
      <div className="flex-1" />
    </aside>
  );
}
