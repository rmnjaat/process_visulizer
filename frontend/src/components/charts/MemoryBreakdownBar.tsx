import { formatBytes } from '../../utils/format';
import { Tooltip } from '../common/Tooltip';

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
  description: string;
}

const segmentDescriptions: Record<string, string> = {
  // macOS segments
  'App Memory':
    'RAM actively used by your applications (browsers, editors, etc). ' +
    'This is memory that apps have requested and are using. ' +
    'If this grows steadily over time, an app may have a memory leak.',
  'Wired':
    'Memory locked in physical RAM by the OS kernel — it can NEVER be swapped to disk. ' +
    'Includes kernel code, page tables, and I/O buffers. ' +
    'You cannot free wired memory; it\'s essential for the system to run.',
  'Compressed':
    'Pages that macOS compressed in RAM instead of swapping to disk. ' +
    'Compression is faster than disk I/O, so this is a performance optimization. ' +
    'High compressed memory means the system is under memory pressure but coping well.',
  'Free':
    'RAM not currently used by anything. On a healthy system this is often LOW — ' +
    'macOS aggressively caches data in "available" memory. ' +
    'Don\'t worry if free is small; check "Available" for true headroom.',
  // Linux segments
  'App Used':
    'RAM actively consumed by application processes (total used minus cache/buffers/shared). ' +
    'This is the real footprint of your running programs.',
  'Cached':
    'Disk data the OS keeps in RAM for faster re-reads (page cache). ' +
    'This memory is reclaimable — if an app needs RAM, the OS drops caches automatically. ' +
    'High cache is GOOD; it speeds up file access.',
  'Buffers':
    'Small temporary area for raw block device I/O (disk metadata, directory entries). ' +
    'Usually only a few hundred MB. Reclaimable just like cached memory.',
  'Shared':
    'Memory shared between multiple processes via shared libraries (libc, etc.) or IPC (tmpfs, mmap). ' +
    'Counted once in total but accessible by many processes.',
};

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
      { label: 'App Memory', value: app_memory, color: 'var(--color-warning)', description: segmentDescriptions['App Memory'] },
      { label: 'Wired', value: wired, color: 'var(--color-danger)', description: segmentDescriptions['Wired'] },
      { label: 'Compressed', value: compressed, color: 'var(--color-info)', description: segmentDescriptions['Compressed'] },
      { label: 'Free', value: free, color: 'var(--color-success)', description: segmentDescriptions['Free'] },
    ].filter((s) => s.value > 0);
  } else {
    const appUsed = Math.max(0, used - cached - buffers - shared);
    segments = [
      { label: 'App Used', value: appUsed, color: 'var(--color-danger)', description: segmentDescriptions['App Used'] },
      { label: 'Cached', value: cached, color: 'var(--color-primary)', description: segmentDescriptions['Cached'] },
      { label: 'Buffers', value: buffers, color: 'var(--color-info)', description: segmentDescriptions['Buffers'] },
      { label: 'Shared', value: shared, color: 'var(--color-warning)', description: segmentDescriptions['Shared'] },
      { label: 'Free', value: free, color: 'var(--color-success)', description: segmentDescriptions['Free'] },
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
            <Tooltip
              key={seg.label}
              className="h-full relative"
              style={{ width: `${pct}%` }}
              text={`${seg.label}: ${formatBytes(seg.value)} (${pct.toFixed(1)}%)\n\n${seg.description}`}
            >
              <div
                className="w-full h-full transition-all duration-300"
                style={{ backgroundColor: seg.color }}
              />
            </Tooltip>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <Tooltip key={seg.label} text={seg.description}>
              <div className="flex items-center gap-2 cursor-help">
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
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
