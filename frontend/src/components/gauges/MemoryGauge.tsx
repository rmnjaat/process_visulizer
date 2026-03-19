import { formatBytes } from '../../utils/format';

interface MemoryGaugeProps {
  value: number;
  used: number;
  total: number;
}

export default function MemoryGauge({ value, used, total }: MemoryGaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const color =
    clamped < 50
      ? 'var(--color-success)'
      : clamped < 80
        ? 'var(--color-warning)'
        : 'var(--color-danger)';

  // Semi-circle gauge using stroke-dasharray for a clean arc.
  const radius = 40;
  const cx = 50;
  const cy = 55;
  const strokeWidth = 8;

  // Half-circumference = the total length of the semi-circle arc
  const halfCircumference = Math.PI * radius;
  const filledLength = (clamped / 100) * halfCircumference;

  // Arc endpoints: left (10,55) to right (90,55)
  const x1 = cx - radius;
  const y1 = cy;
  const x2 = cx + radius;
  const y2 = cy;

  // Background semi-circle path (left to right, sweeping up)
  const arcPath = `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}`;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 70" className="w-32 h-auto">
        {/* Background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {clamped > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filledLength} ${halfCircumference}`}
          />
        )}
        {/* Percentage text */}
        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          fill="var(--text-primary)"
          fontSize="14"
          fontWeight="bold"
        >
          {clamped.toFixed(1)}%
        </text>
      </svg>
      <span
        className="text-sm font-medium -mt-1"
        style={{ color: 'var(--text-secondary)' }}
      >
        Memory
      </span>
      <span
        className="text-xs mt-0.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {formatBytes(used)} / {formatBytes(total)}
      </span>
    </div>
  );
}
