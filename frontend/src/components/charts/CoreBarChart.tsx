interface CoreBarChartProps {
  cores: number[];
}

function getBarColor(value: number): string {
  if (value < 50) return 'var(--color-success)';
  if (value < 80) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

export default function CoreBarChart({ cores }: CoreBarChartProps) {
  return (
    <div className="flex flex-col gap-2">
      {cores.map((usage, i) => (
        <div key={i} className="flex items-center gap-3">
          <span
            className="text-xs w-14 text-right shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            Core {i}
          </span>
          <div
            className="flex-1 h-4 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-elevated)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, usage))}%`,
                backgroundColor: getBarColor(usage),
              }}
            />
          </div>
          <span
            className="text-xs w-12 text-right shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            {usage.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
