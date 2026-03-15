import { formatBytes } from '../../utils/format';

interface ProcessMemoryBarProps {
  uss: number;
  shared: number;
  text: number;
  data: number;
  lib: number;
  rss: number;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

export default function ProcessMemoryBar({
  uss,
  shared,
  text,
  data,
  lib,
  rss,
}: ProcessMemoryBarProps) {
  const segments: Segment[] = [
    { label: 'USS (Unique)', value: uss, color: '#e06c75' },
    { label: 'Shared', value: shared, color: '#61afef' },
    { label: 'Text', value: text, color: '#c678dd' },
    { label: 'Data', value: data, color: '#e5c07b' },
    { label: 'Lib', value: lib, color: '#56b6c2' },
  ].filter((s) => s.value > 0);

  // Use RSS as total if available; otherwise sum segments
  const total = rss > 0 ? rss : segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0 || segments.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 mb-4">
      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        RSS Breakdown
      </span>

      {/* Stacked bar */}
      <div
        className="flex h-7 rounded-lg overflow-hidden"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
      >
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={seg.label}
              className="h-full transition-all duration-300"
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
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: seg.color }}
              />
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
