import type { SystemInfo } from '../../types/system';

interface CoreHeatmapProps {
  history: SystemInfo[];
  maxColumns?: number;
}

function getHeatColor(value: number): string {
  if (value < 20) return '#064e3b';   // dark green
  if (value < 40) return '#166534';   // green
  if (value < 60) return '#a16207';   // yellow-brown
  if (value < 80) return '#c2410c';   // orange
  return '#dc2626';                    // red
}

export default function CoreHeatmap({ history, maxColumns = 60 }: CoreHeatmapProps) {
  // Take the last N snapshots
  const sliced = history.slice(-maxColumns);

  if (sliced.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px]" style={{ color: 'var(--text-muted)' }}>
        Collecting data...
      </div>
    );
  }

  const numCores = sliced[0].cpu.usage_per_core.length;

  return (
    <div className="flex flex-col gap-1">
      {/* Legend */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>0%</span>
        <div className="flex h-3 flex-1 rounded overflow-hidden">
          {[0, 20, 40, 60, 80].map((v) => (
            <div key={v} className="flex-1" style={{ backgroundColor: getHeatColor(v) }} />
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>100%</span>
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="flex flex-col gap-px" style={{ minWidth: sliced.length * 6 }}>
          {Array.from({ length: numCores }, (_, coreIdx) => (
            <div key={coreIdx} className="flex items-center gap-0">
              <span
                className="text-xs w-12 text-right pr-2 shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                C{coreIdx}
              </span>
              <div className="flex gap-px flex-1">
                {sliced.map((snap, colIdx) => {
                  const usage = snap.cpu.usage_per_core[coreIdx] ?? 0;
                  return (
                    <div
                      key={colIdx}
                      className="flex-1 rounded-sm"
                      style={{
                        backgroundColor: getHeatColor(usage),
                        minWidth: 4,
                        height: 16,
                      }}
                      title={`Core ${coreIdx}: ${usage.toFixed(1)}% (${sliced.length - 1 - colIdx}s ago)`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time labels */}
      <div className="flex items-center mt-1" style={{ paddingLeft: 48 }}>
        <span className="text-xs flex-1 text-left" style={{ color: 'var(--text-muted)' }}>
          -{sliced.length - 1}s
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          now
        </span>
      </div>
    </div>
  );
}
