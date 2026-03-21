import { useCallback, useMemo } from 'react';
import { List } from 'react-window';
import { useProcessStore } from '../stores/processStore';
import { Drawer } from '../components/layout/Drawer';
import { ProcessBadge } from '../components/badges/ProcessBadge';
import { ProcessRowComponent } from '../components/process/ProcessRow';
import type { ProcessRowProps } from '../components/process/ProcessRow';
import { ProcessDetail } from '../components/process/ProcessDetail';

const ROW_HEIGHT = 48;

const COLUMNS: { label: string; field: string; className?: string }[] = [
  { label: 'Type', field: '', className: 'text-left' },
  { label: 'PID', field: 'pid', className: 'text-left' },
  { label: 'Name', field: 'name', className: 'text-left' },
  { label: 'CPU %', field: 'cpu_percent', className: 'text-right pr-4' },
  { label: 'Memory', field: 'memory_rss_bytes', className: 'text-right pr-4' },
  { label: 'Threads', field: 'num_threads', className: 'text-center' },
  { label: 'State', field: 'status', className: 'text-left' },
  { label: 'User', field: 'username', className: 'text-left' },
];

export default function ProcessList() {
  const sortedProcesses = useProcessStore((s) => s.sortedProcesses);
  const sortField = useProcessStore((s) => s.sortField);
  const sortDirection = useProcessStore((s) => s.sortDirection);
  const setSortField = useProcessStore((s) => s.setSortField);
  const toggleSortDirection = useProcessStore((s) => s.toggleSortDirection);
  const selectedPid = useProcessStore((s) => s.selectedPid);
  const setSelectedPid = useProcessStore((s) => s.setSelectedPid);

  const processes = sortedProcesses();

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

  const rowProps: ProcessRowProps = useMemo(
    () => ({ processes, onSelectPid: setSelectedPid }),
    [processes, setSelectedPid],
  );

  const selectedProcess = selectedPid !== null ? processes.find((p) => p.pid === selectedPid) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Table header */}
      <div
        className="process-grid sticky top-0 z-10 grid items-center px-4 h-10 text-xs font-semibold uppercase tracking-wider shrink-0"
        style={{
          gridTemplateColumns: '100px 70px 1fr 80px 90px 70px 90px 100px',
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
            No processes found.
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
