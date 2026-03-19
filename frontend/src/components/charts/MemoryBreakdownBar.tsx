import { formatBytes } from '../../utils/format';

interface MemoryBreakdownBarProps {
  used: number;
  cached: number;
  buffers: number;
  shared: number;
  free: number;
  total: number;
  // macOS-specific
  wired?: number;
  compressed?: number;
  app_memory?: number;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

export default function MemoryBreakdownBar({
  used,
  cached,
  buffers,
  shared,
  free,
  total,
  wired = 0,
  compressed = 0,
  app_memory = 0,
}: MemoryBreakdownBarProps) {
  if (total === 0) return null;

  // On macOS we have wired/compressed/app_memory breakdown from vm_stat
  const isMacOS = wired > 0 || compressed > 0;

  let segments: Segment[];

  if (isMacOS) {
    segments = [
      { label: 'App Memory', value: app_memory, color: 'var(--color-warning)' },
      { label: 'Wired', value: wired, color: 'var(--color-danger)' },
      { label: 'Compressed', value: compressed, color: 'var(--color-info)' },
      { label: 'Free', value: free, color: 'var(--color-success)' },
    ].filter((s) => s.value > 0);
  } else {
    const appUsed = Math.max(0, used - cached - buffers - shared);
    segments = [
      { label: 'App Used', value: appUsed, color: 'var(--color-danger)' },
      { label: 'Cached', value: cached, color: 'var(--color-primary)' },
      { label: 'Buffers', value: buffers, color: 'var(--color-info)' },
      { label: 'Shared', value: shared, color: 'var(--color-warning)' },
      { label: 'Free', value: free, color: 'var(--color-success)' },
    ].filter((s) => s.value > 0);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stacked bar */}
      <div className="flex h-8 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={seg.label}
              className="h-full transition-all duration-300 relative group"
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${formatBytes(seg.value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <div key={seg.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {seg.label}
              </span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
                {formatBytes(seg.value)}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ({pct.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
