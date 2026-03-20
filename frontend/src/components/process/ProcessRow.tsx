import type { CSSProperties, ReactElement } from 'react';
import type { ProcessInfo } from '../../types/process';
import { ProcessBadge } from '../badges/ProcessBadge';
import { StateBadge } from '../common/StateBadge';
import { formatBytes, formatPercent } from '../../utils/format';

export interface ProcessRowProps {
  processes: ProcessInfo[];
  onSelectPid: (pid: number) => void;
}

export function ProcessRowComponent({
  index,
  style,
  processes,
  onSelectPid,
}: {
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
  index: number;
  style: CSSProperties;
  processes: ProcessInfo[];
  onSelectPid: (pid: number) => void;
}): ReactElement | null {
  const process = processes[index];
  if (!process) return null;

  const isCpuSpike = process.cpu_percent > 50;

  return (
    <div
      className={`process-grid grid items-center px-4 cursor-pointer transition-colors${isCpuSpike ? ' cpu-spike' : ''}`}
      style={{
        ...style,
        gridTemplateColumns: '100px 70px 1fr 80px 90px 70px 90px 100px',
        color: 'var(--text-primary)',
      }}
      onClick={() => onSelectPid(process.pid)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div className="shrink-0 overflow-hidden">
        <ProcessBadge />
      </div>
      <div className="text-sm font-mono overflow-hidden" style={{ color: 'var(--text-secondary)' }}>
        {process.pid}
      </div>
      <div className="text-sm truncate pr-2">{process.name}</div>
      <div className="text-sm text-right pr-4">{formatPercent(process.cpu_percent)}</div>
      <div className="text-sm text-right pr-4">{formatBytes(process.memory_rss_bytes)}</div>
      <div className="text-sm text-center">{process.num_threads}</div>
      <div className="text-sm">
        <StateBadge state={process.status} />
      </div>
      <div className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
        {process.username}
      </div>
    </div>
  );
}
