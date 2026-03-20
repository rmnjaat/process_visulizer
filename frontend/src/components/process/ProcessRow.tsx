import type { CSSProperties, ReactElement } from 'react';
import type { ProcessInfo } from '../../types/process';
import type { ProcessHistory } from '../../stores/processStore';
import { ProcessBadge } from '../badges/ProcessBadge';
import { StateBadge } from '../common/StateBadge';
import { Sparkline } from '../charts/Sparkline';
import { formatBytes, formatPercent } from '../../utils/format';
import { Pin } from 'lucide-react';

export interface ProcessRowProps {
  processes: ProcessInfo[];
  history: Record<number, ProcessHistory>;
  onSelectPid: (pid: number) => void;
  pinnedPids: Set<number>;
  onTogglePin: (pid: number) => void;
  /** Number of pinned processes at the top of the list (used to render divider). */
  pinnedCount: number;
}

/* ── Anomaly thresholds ────────────────────────────────── */
const ONE_GB = 1024 * 1024 * 1024;
const FOUR_GB = 4 * ONE_GB;
const HIGH_CPU_THRESHOLD = 80;
const HIGH_FD_THRESHOLD = 1000;

export function ProcessRowComponent({
  index,
  style,
  processes,
  history,
  onSelectPid,
  pinnedPids,
  onTogglePin,
  pinnedCount,
}: {
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
  index: number;
  style: CSSProperties;
  processes: ProcessInfo[];
  history: Record<number, ProcessHistory>;
  onSelectPid: (pid: number) => void;
  pinnedPids: Set<number>;
  onTogglePin: (pid: number) => void;
  pinnedCount: number;
}): ReactElement | null {
  const process = processes[index];
  if (!process) return null;

  const hist = history[process.pid];
  const pinned = pinnedPids.has(process.pid);
  const showDivider = pinnedCount > 0 && index === pinnedCount;

  /* ── Detect anomalies ─────────────────────────────────── */
  const statusLower = process.status.toLowerCase();
  const isZombie = statusLower === 'zombie';
  const isStopped = statusLower === 'stopped';
  const isHighCpu = process.cpu_percent > HIGH_CPU_THRESHOLD;
  const isVeryHighMem = process.memory_rss_bytes > FOUR_GB;
  const isHighMem = !isVeryHighMem && process.memory_rss_bytes > ONE_GB;
  const isHighFd = process.num_fds > HIGH_FD_THRESHOLD;
  const isZeroThreads = process.num_threads === 0;

  // Keep the original cpu-spike animation for >50%
  const isCpuSpike = process.cpu_percent > 50;

  /* ── Build row class list ─────────────────────────────── */
  const rowClasses = [
    'process-grid grid items-center px-4 cursor-pointer transition-colors',
    isCpuSpike && 'cpu-spike',
    isZombie && 'anomaly-zombie',
    isStopped && 'anomaly-stopped',
    isHighFd && 'anomaly-high-fd',
  ]
    .filter(Boolean)
    .join(' ');

  /* ── Row-level tooltip listing all active anomalies ──── */
  const anomalyTips: string[] = [];
  if (isZombie)
    anomalyTips.push(
      'Zombie: process has exited but its parent has not called wait() to read its exit status. This is usually a bug in the parent process.'
    );
  if (isStopped)
    anomalyTips.push(
      'Stopped: process received SIGSTOP or SIGTSTP and is paused until SIGCONT is sent.'
    );
  if (isHighCpu)
    anomalyTips.push(
      `High CPU (${formatPercent(process.cpu_percent)}): process is consuming significant CPU time. May indicate a compute-heavy workload or a busy loop.`
    );
  if (isVeryHighMem)
    anomalyTips.push(
      `Very high memory (${formatBytes(process.memory_rss_bytes)}): RSS exceeds 4 GB. This process is a major memory consumer and could trigger the OOM killer.`
    );
  else if (isHighMem)
    anomalyTips.push(
      `High memory (${formatBytes(process.memory_rss_bytes)}): RSS exceeds 1 GB. Worth monitoring for potential memory leaks.`
    );
  if (isHighFd)
    anomalyTips.push(
      `High FD count (${process.num_fds}): more than ${HIGH_FD_THRESHOLD} open file descriptors. May indicate a file descriptor leak.`
    );
  if (isZeroThreads)
    anomalyTips.push(
      'Zero threads: a running process should have at least 1 thread. This may indicate the process is in a broken or transitional state.'
    );

  const rowTitle = anomalyTips.length > 0 ? anomalyTips.join('\n') : undefined;

  /* ── Memory cell class ────────────────────────────────── */
  const memCellClass = isVeryHighMem
    ? 'anomaly-cell-very-high-mem'
    : isHighMem
      ? 'anomaly-cell-high-mem'
      : undefined;

  const memCellTitle = isVeryHighMem
    ? 'RSS > 4 GB -- very high memory usage; could trigger the OOM killer'
    : isHighMem
      ? 'RSS > 1 GB -- elevated memory usage; monitor for leaks'
      : undefined;

  return (
    <div style={style}>
      {/* Divider between pinned and unpinned rows */}
      {showDivider && (
        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent, var(--color-warning), transparent)',
            margin: '0 16px',
            opacity: 0.4,
          }}
        />
      )}
      <div
        className={rowClasses}
        style={{
          gridTemplateColumns: '36px 100px 70px 1fr 80px 64px 90px 64px 70px 90px 100px',
          color: 'var(--text-primary)',
          height: showDivider ? 'calc(100% - 1px)' : '100%',
        }}
        title={rowTitle}
        onClick={() => onSelectPid(process.pid)}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '';
        }}
      >
        {/* Pin button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            title={pinned ? 'Unpin from watchlist' : 'Pin to watchlist'}
            className="flex items-center justify-center rounded p-1 transition-colors"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: pinned ? 'var(--color-warning)' : 'var(--text-muted)',
              opacity: pinned ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              if (!pinned) e.currentTarget.style.color = 'var(--color-warning)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = pinned ? '1' : '0.5';
              if (!pinned) e.currentTarget.style.color = 'var(--text-muted)';
            }}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(process.pid);
            }}
          >
            <Pin
              size={14}
              fill={pinned ? 'var(--color-warning)' : 'none'}
              strokeWidth={pinned ? 2 : 1.5}
            />
          </button>
        </div>

        {/* Badge column */}
        <div className="shrink-0 overflow-hidden">
          <ProcessBadge />
        </div>

        {/* PID */}
        <div
          className="text-sm font-mono overflow-hidden"
          style={{ color: 'var(--text-secondary)' }}
        >
          {process.pid}
        </div>

        {/* Name + anomaly badges */}
        <div className="text-sm truncate pr-2 flex items-center gap-1.5">
          <span className="truncate">{process.name}</span>
          {isZombie && (
            <span
              className="anomaly-badge anomaly-badge--zombie"
              title="Zombie: parent has not reaped this exited child process"
            >
              Zombie
            </span>
          )}
          {isStopped && (
            <span
              className="anomaly-badge anomaly-badge--stopped"
              title="Stopped: process is paused (SIGSTOP/SIGTSTP)"
            >
              Stopped
            </span>
          )}
          {isHighFd && (
            <span
              className="anomaly-badge anomaly-badge--high-fd"
              title={`${process.num_fds} open file descriptors -- possible FD leak`}
            >
              FD:{process.num_fds}
            </span>
          )}
        </div>

        {/* CPU % */}
        <div
          className={`text-sm text-right pr-4${isHighCpu ? ' anomaly-cell-high-cpu' : ''}`}
          title={
            isHighCpu
              ? `CPU at ${formatPercent(process.cpu_percent)} -- high utilization; may be compute-bound or stuck in a busy loop`
              : undefined
          }
        >
          {formatPercent(process.cpu_percent)}
        </div>

        {/* CPU sparkline */}
        <div className="flex items-center justify-center">
          <Sparkline data={hist?.cpu ?? []} color="var(--color-primary)" />
        </div>

        {/* Memory */}
        <div
          className={`text-sm text-right pr-4${memCellClass ? ` ${memCellClass}` : ''}`}
          title={memCellTitle}
        >
          {formatBytes(process.memory_rss_bytes)}
        </div>

        {/* Memory sparkline */}
        <div className="flex items-center justify-center">
          <Sparkline data={hist?.mem ?? []} color="#a78bfa" />
        </div>

        {/* Threads */}
        <div
          className={`text-sm text-center${isZeroThreads ? ' anomaly-cell-zero-threads' : ''}`}
          title={
            isZeroThreads
              ? 'Zero threads: unusual -- a healthy process should have at least 1 thread'
              : undefined
          }
        >
          {process.num_threads}
        </div>

        {/* Status */}
        <div className="text-sm">
          <StateBadge state={process.status} />
        </div>

        {/* Username */}
        <div
          className="text-sm truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {process.username}
        </div>
      </div>
    </div>
  );
}
