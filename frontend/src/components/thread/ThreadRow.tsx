import type { ThreadInfo } from '../../types/thread';
import { ThreadBadge } from '../badges/ThreadBadge';
import { StateBadge } from '../common/StateBadge';
import { formatPercent, formatDuration } from '../../utils/format';

interface ThreadRowProps {
  thread: ThreadInfo;
  onClick: () => void;
}

export function ThreadRow({ thread, onClick }: ThreadRowProps) {
  const totalCpuTime = thread.cpu_time_user + thread.cpu_time_system;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 rounded-lg border-none cursor-pointer text-left transition-colors"
      style={{
        height: 40,
        backgroundColor: 'transparent',
        color: 'var(--text-primary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <ThreadBadge />

      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>
        {thread.tid}
      </span>

      <span
        className="text-sm truncate"
        style={{ color: 'var(--text-primary)', flex: 1, minWidth: 0 }}
      >
        {thread.name || 'unnamed'}
      </span>

      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>
        {formatPercent(thread.cpu_percent)}
      </span>

      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
        {totalCpuTime > 0 ? formatDuration(totalCpuTime) : 'N/A'}
      </span>

      <span className="shrink-0">
        {thread.state === 'unknown' ? (
          <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>N/A</span>
        ) : (
          <StateBadge state={thread.state} />
        )}
      </span>
    </button>
  );
}
