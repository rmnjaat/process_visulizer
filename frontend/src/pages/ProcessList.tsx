import { useCallback, useMemo, useState } from 'react';
import { List } from 'react-window';
import { useProcessStore } from '../stores/processStore';
import { Drawer } from '../components/layout/Drawer';
import { ProcessBadge } from '../components/badges/ProcessBadge';
import { ProcessRowComponent } from '../components/process/ProcessRow';
import type { ProcessRowProps } from '../components/process/ProcessRow';
import { ProcessDetail } from '../components/process/ProcessDetail';
import type { ProcessInfo } from '../types/process';

const ROW_HEIGHT = 48;

const COLUMNS: { label: string; field: string; className?: string }[] = [
  { label: '', field: '', className: 'text-center' },       // Pin column
  { label: 'Type', field: '', className: 'text-left' },
  { label: 'PID', field: 'pid', className: 'text-left' },
  { label: 'Name', field: 'name', className: 'text-left' },
  { label: 'CPU %', field: 'cpu_percent', className: 'text-right pr-4' },
  { label: 'CPU Trend', field: '', className: 'text-center' },
  { label: 'Memory', field: 'memory_rss_bytes', className: 'text-right pr-4' },
  { label: 'Mem Trend', field: '', className: 'text-center' },
  { label: 'Threads', field: 'num_threads', className: 'text-center' },
  { label: 'State', field: 'status', className: 'text-left' },
  { label: 'User', field: 'username', className: 'text-left' },
];

const GRID_TEMPLATE = '36px 100px 70px 1fr 80px 64px 90px 64px 70px 90px 100px';

const STATE_OPTIONS = ['All', 'Running', 'Sleeping', 'Zombie', 'Stopped'] as const;

/** Shared inline styles for filter inputs and selects. */
const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--text-muted)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  outline: 'none',
  height: 30,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'auto' as const,
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

export default function ProcessList() {
  const sortedProcesses = useProcessStore((s) => s.sortedProcesses);
  const sortField = useProcessStore((s) => s.sortField);
  const sortDirection = useProcessStore((s) => s.sortDirection);
  const setSortField = useProcessStore((s) => s.setSortField);
  const toggleSortDirection = useProcessStore((s) => s.toggleSortDirection);
  const selectedPid = useProcessStore((s) => s.selectedPid);
  const setSelectedPid = useProcessStore((s) => s.setSelectedPid);
  const history = useProcessStore((s) => s.history);
  const pinnedPids = useProcessStore((s) => s.pinnedPids);
  const togglePin = useProcessStore((s) => s.togglePin);

  // --- Local filter state ---
  const [searchText, setSearchText] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [userFilter, setUserFilter] = useState('All');
  const [cpuThreshold, setCpuThreshold] = useState('');
  const [memThreshold, setMemThreshold] = useState('');

  const allProcesses = sortedProcesses();

  // Derive unique usernames from the full (unfiltered) process list.
  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    for (const p of allProcesses) {
      if (p.username) users.add(p.username);
    }
    return Array.from(users).sort((a, b) => a.localeCompare(b));
  }, [allProcesses]);

  // Apply all filters (AND logic).
  const processes = useMemo(() => {
    let list: ProcessInfo[] = allProcesses;

    // Text search: match name or PID
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          String(p.pid).includes(q),
      );
    }

    // State filter
    if (stateFilter !== 'All') {
      const s = stateFilter.toLowerCase();
      list = list.filter((p) => p.status.toLowerCase() === s);
    }

    // User filter
    if (userFilter !== 'All') {
      list = list.filter((p) => p.username === userFilter);
    }

    // CPU threshold
    const cpuNum = parseFloat(cpuThreshold);
    if (!isNaN(cpuNum) && cpuNum >= 0) {
      list = list.filter((p) => p.cpu_percent > cpuNum);
    }

    // Memory threshold (input is in MB, field is in bytes)
    const memNum = parseFloat(memThreshold);
    if (!isNaN(memNum) && memNum >= 0) {
      list = list.filter((p) => p.memory_rss_bytes > memNum * 1024 * 1024);
    }

    return list;
  }, [allProcesses, searchText, stateFilter, userFilter, cpuThreshold, memThreshold]);

  const hasActiveFilters =
    searchText !== '' ||
    stateFilter !== 'All' ||
    userFilter !== 'All' ||
    cpuThreshold !== '' ||
    memThreshold !== '';

  const clearFilters = () => {
    setSearchText('');
    setStateFilter('All');
    setUserFilter('All');
    setCpuThreshold('');
    setMemThreshold('');
  };

  const handleColumnClick = useCallback(
    (field: string) => {
      if (!field) return;
      if (field === sortField) {
        toggleSortDirection();
      } else {
        setSortField(field);
      }
    },
    [sortField, setSortField, toggleSortDirection],
  );

  // Count how many pinned processes appear at the top of the (filtered) list.
  const pinnedCount = useMemo(
    () => processes.filter((p) => pinnedPids.has(p.pid)).length,
    [processes, pinnedPids],
  );

  const rowProps: ProcessRowProps = useMemo(
    () => ({ processes, history, onSelectPid: setSelectedPid, pinnedPids, onTogglePin: togglePin, pinnedCount }),
    [processes, history, setSelectedPid, pinnedPids, togglePin, pinnedCount],
  );

  const selectedProcess = selectedPid !== null ? processes.find((p) => p.pid === selectedPid) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-2 flex-wrap"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--bg-elevated)',
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-1.5">
          <label style={labelStyle}>Search</label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Name or PID"
            style={{ ...inputStyle, width: 160 }}
          />
        </div>

        {/* State dropdown */}
        <div className="flex items-center gap-1.5">
          <label style={labelStyle}>State</label>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={selectStyle}
          >
            {STATE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* User dropdown */}
        <div className="flex items-center gap-1.5">
          <label style={labelStyle}>User</label>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="All">All</option>
            {uniqueUsers.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* CPU threshold */}
        <div className="flex items-center gap-1.5">
          <label style={labelStyle}>CPU &gt;</label>
          <input
            type="number"
            min={0}
            step={1}
            value={cpuThreshold}
            onChange={(e) => setCpuThreshold(e.target.value)}
            placeholder="%"
            style={{ ...inputStyle, width: 60, textAlign: 'right' }}
          />
          <span style={{ ...labelStyle, color: 'var(--text-muted)' }}>%</span>
        </div>

        {/* Memory threshold */}
        <div className="flex items-center gap-1.5">
          <label style={labelStyle}>Mem &gt;</label>
          <input
            type="number"
            min={0}
            step={1}
            value={memThreshold}
            onChange={(e) => setMemThreshold(e.target.value)}
            placeholder="MB"
            style={{ ...inputStyle, width: 70, textAlign: 'right' }}
          />
          <span style={{ ...labelStyle, color: 'var(--text-muted)' }}>MB</span>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              height: 30,
              whiteSpace: 'nowrap',
            }}
          >
            Clear Filters
          </button>
        )}

        {/* Match count */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {processes.length} of {allProcesses.length} processes
        </span>
      </div>

      {/* Table header */}
      <div
        className="process-grid sticky top-0 z-10 grid items-center px-4 h-10 text-xs font-semibold uppercase tracking-wider shrink-0"
        style={{
          gridTemplateColumns: GRID_TEMPLATE,
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
        }}
      >
        {COLUMNS.map((col) => (
          <div
            key={col.label}
            className={`${col.className ?? ''} ${col.field ? 'cursor-pointer select-none hover:text-white' : ''}`}
            onClick={() => handleColumnClick(col.field)}
          >
            {col.label}
            {col.field && col.field === sortField && (
              <span className="ml-1">{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
            )}
          </div>
        ))}
      </div>

      {/* Virtual scrolling list */}
      <div className="flex-1 min-h-0">
        {processes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {hasActiveFilters ? 'No processes match the current filters.' : 'No processes found.'}
          </div>
        ) : (
          <List<ProcessRowProps>
            rowComponent={ProcessRowComponent}
            rowCount={processes.length}
            rowHeight={ROW_HEIGHT}
            rowProps={rowProps}
            overscanCount={10}
            style={{ height: '100%' }}
          />
        )}
      </div>

      {/* Detail Drawer */}
      <Drawer
        isOpen={selectedPid !== null}
        onClose={() => setSelectedPid(null)}
        title={selectedProcess ? `${selectedProcess.name} (PID ${selectedProcess.pid})` : 'Process Detail'}
        badge={<ProcessBadge />}
      >
        {selectedPid !== null && <ProcessDetail pid={selectedPid} />}
      </Drawer>
    </div>
  );
}
